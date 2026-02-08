import {MarkdownPostProcessorContext, MarkdownRenderer, Notice, Plugin, TFile} from 'obsidian';
import {DEFAULT_SETTINGS, TimelinePluginSettings, TimelineSettingTab} from './settings';

type TimelineEntry = {
	date?: string;
	title?: string;
	body: string;
};

export default class TimelinePlugin extends Plugin {
	settings: TimelinePluginSettings;
	private readonly hideMarkersClass = 'timeline-hide-markers';

	refreshTimelineViews(): void {
		this.app.workspace.trigger('markdown-preview-refresh');
	}

	async onload() {
		await this.loadSettings();
		this.applyMarkerVisibility();
		this.addSettingTab(new TimelineSettingTab(this.app, this));

		this.addCommand({
			id: 'convert-timeline-blocks-to-html',
			name: 'Convert timeline blocks to HTML (Publish)',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					return false;
				}
				if (checking) {
					return true;
				}
				void this.convertTimelineBlocksToHtml(file);
				return true;
			}
		});

		this.registerMarkdownCodeBlockProcessor('timeline', async (source, el, ctx) => {
			const entries = parseTimelineSource(source);
			const container = el.createDiv({cls: 'timeline'});
			await renderTimelineEntries(entries, container, ctx, this.settings, this);
		});

		this.register(() => {
			document.body.classList.remove(this.hideMarkersClass);
		});
	}

	applyMarkerVisibility(): void {
		document.body.classList.toggle(this.hideMarkersClass, !this.settings.showMarkers);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async convertTimelineBlocksToHtml(file: TFile) {
		const content = await this.app.vault.read(file);
		const timelineRegex = /```timeline\s*\n([\s\S]*?)\n```/g;
		let match: RegExpExecArray | null;
		let lastIndex = 0;
		let output = '';
		let replacedCount = 0;

		while ((match = timelineRegex.exec(content)) !== null) {
			output += content.slice(lastIndex, match.index);
			const source = match[1] ?? '';
			const html = await renderTimelineHtml(
				source,
				this.settings,
				file.path,
				this
			);
			output += html;
			lastIndex = timelineRegex.lastIndex;
			replacedCount += 1;
		}

		if (replacedCount === 0) {
			new Notice('No timeline code blocks found in this file.');
			return;
		}

		output += content.slice(lastIndex);
		await this.app.vault.modify(file, output);
		new Notice(`Converted ${replacedCount} timeline block(s) to HTML.`);
	}

}

function parseTimelineSource(source: string): TimelineEntry[] {
	const trimmedSource = source.trim();
	if (trimmedSource.length === 0) {
		return [];
	}

	const blocks = trimmedSource.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
	const entries: TimelineEntry[] = [];

	for (const block of blocks) {
		const lines = block.split(/\n/);
		const headerLine = lines[0]?.trim() ?? '';
		const bodyLines = lines.slice(1).join('\n').trim();
		const headerIsBody = isLikelyBodyStart(headerLine);

		if (headerIsBody) {
			entries.push({body: block});
			continue;
		}

		const {date, title} = parseHeader(headerLine);
		const body = bodyLines.length > 0 ? bodyLines : '';
		if (!date && !title && body.length === 0) {
			entries.push({body: block});
			continue;
		}

		entries.push({date, title, body});
	}

	return entries;
}

function parseHeader(headerLine: string): {date?: string; title?: string} {
	const pipeParts = headerLine.split('|');
	if (pipeParts.length >= 2) {
		const date = (pipeParts[0] ?? '').trim();
		const title = pipeParts.slice(1).join('|').trim();
		return {
			date: date.length > 0 ? date : undefined,
			title: title.length > 0 ? title : undefined
		};
	}

	const dashParts = headerLine.split(' - ');
	if (dashParts.length >= 2) {
		const date = (dashParts[0] ?? '').trim();
		const title = dashParts.slice(1).join(' - ').trim();
		return {
			date: date.length > 0 ? date : undefined,
			title: title.length > 0 ? title : undefined
		};
	}

	const header = headerLine.trim();
	return {title: header.length > 0 ? header : undefined};
}

function isLikelyBodyStart(line: string): boolean {
	const trimmed = line.trim();
	if (trimmed.length === 0) {
		return true;
	}
	if (/^(```|>\s+|[-*+]\s+|\d+\.)/.test(trimmed)) {
		return true;
	}
	return false;
}

async function renderTimelineHtml(
	source: string,
	settings: TimelinePluginSettings,
	sourcePath: string,
	plugin: TimelinePlugin
): Promise<string> {
	const entries = parseTimelineSource(source);
	let html = '<div class="timeline">';

	if (entries.length === 0) {
		html += '<div class="timeline-empty">No timeline entries found.</div></div>';
		return html;
	}

	if (settings.showMarkers) {
		html += '<div class="timeline-start-marker" aria-hidden="true"></div>';
	}

	for (const entry of entries) {
		html += '<div class="timeline-item">';
		if (settings.showMarkers) {
			html += '<div class="timeline-marker" aria-hidden="true"></div>';
		}
		html += '<div class="timeline-content">';

		const fallbackDate = settings.defaultDateLabel.trim();
		const dateText = entry.date ?? (fallbackDate.length > 0 ? fallbackDate : undefined);
		if (dateText || entry.title) {
			html += '<div class="timeline-meta">';
			if (dateText) {
				html += `<span class="timeline-date">${escapeHtml(dateText)}</span>`;
			}
			if (entry.title) {
				html += `<span class="timeline-title">${escapeHtml(entry.title)}</span>`;
			}
			html += '</div>';
		}

		const body = entry.body.trim();
		if (body.length > 0) {
			const bodyHost = document.createElement('div');
			await MarkdownRenderer.renderMarkdown(body, bodyHost, sourcePath, plugin);
			const bodyHtml = bodyHost.innerHTML.trim();
			if (bodyHtml.length > 0) {
				html += `<div class="timeline-body">${bodyHtml}</div>`;
			}
		}

		html += '</div></div>';
	}

	html += '</div>';
	return html;
}

async function renderTimelineEntries(
	entries: TimelineEntry[],
	container: HTMLDivElement,
	ctx: MarkdownPostProcessorContext,
	settings: TimelinePluginSettings,
	plugin: TimelinePlugin
): Promise<void> {
	if (entries.length === 0) {
		container.createDiv({cls: 'timeline-empty'}).setText('No timeline entries found.');
		return;
	}

	if (settings.showMarkers) {
		container.createDiv({cls: 'timeline-start-marker', attr: {'aria-hidden': 'true'}});
	}

	for (const entry of entries) {
		const item = container.createDiv({cls: 'timeline-item'});
		if (settings.showMarkers) {
			item.createDiv({cls: 'timeline-marker', attr: {'aria-hidden': 'true'}});
		}
		const content = item.createDiv({cls: 'timeline-content'});

		const fallbackDate = settings.defaultDateLabel.trim();
		const dateText = entry.date ?? (fallbackDate.length > 0 ? fallbackDate : undefined);
		if (dateText || entry.title) {
			const meta = content.createDiv({cls: 'timeline-meta'});
			if (dateText) {
				meta.createSpan({cls: 'timeline-date'}).setText(dateText);
			}
			if (entry.title) {
				meta.createSpan({cls: 'timeline-title'}).setText(entry.title);
			}
		}

		const bodyEl = content.createDiv({cls: 'timeline-body'});
		const body = entry.body.trim();
		if (body.length > 0) {
			await MarkdownRenderer.renderMarkdown(body, bodyEl, ctx.sourcePath, plugin);
		}
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
