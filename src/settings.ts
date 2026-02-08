import {App, PluginSettingTab, Setting} from "obsidian";
import TimelinePlugin from "./main";

export interface TimelinePluginSettings {
	showMarkers: boolean;
	defaultDateLabel: string;
}

export const DEFAULT_SETTINGS: TimelinePluginSettings = {
	showMarkers: true,
	defaultDateLabel: 'Date'
};

export class TimelineSettingTab extends PluginSettingTab {
	plugin: TimelinePlugin;

	constructor(app: App, plugin: TimelinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Show markers')
			.setDesc('Display the circular markers on the timeline.')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.showMarkers)
					.onChange(async (value) => {
						this.plugin.settings.showMarkers = value;
						await this.plugin.saveSettings();
						this.plugin.applyMarkerVisibility();
						this.plugin.refreshTimelineViews();
					})
			);

		new Setting(containerEl)
			.setName('Default date label')
			.setDesc('Fallback label used when an entry has no date.')
			.addText(text =>
				text
					.setPlaceholder('Date')
					.setValue(this.plugin.settings.defaultDateLabel)
					.onChange(async (value) => {
						this.plugin.settings.defaultDateLabel = value.trim();
						await this.plugin.saveSettings();
						this.plugin.refreshTimelineViews();
					})
			);

	}
}
