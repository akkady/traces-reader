import * as vscode from 'vscode';
import * as minimatch from 'minimatch';
import * as fs from 'fs';
import * as path from 'path';
import { IOptions } from 'glob';

export function activate(context: vscode.ExtensionContext): void {

	type Configuration = {
		lineReg?: string;
		paths?: string[],
		rules?: Rule[],
	};

	type Rule = {
		patterns?: string[];
		color?: Color;
		matchCase?: boolean;
		matchWholeWord?: boolean;
		bold?: boolean;
		italic?: boolean;
		underline?: boolean;
		strikeThrough?: boolean;
	};

	enum Color {
		black = 'Black',
		brightBlack = 'BrightBlack',
		magenta = 'Magenta',
		red = 'Red',
		brightRed = 'BrightRed',
		blue = 'Blue',
		brightGreen = 'BrightGreen',
		cyan = 'Cyan',
		brightMagenta = 'BrightMagenta',
		brightBlue = 'BrightBlue',
		brightCyan = 'BrightCyan',
		green = 'Green',		
		yellow = 'Yellow',
		brightYellow = 'BrightYellow',
	}

	const configPath = path.join(context.extensionPath, 'src', 'config.json');
    const configurations: Configuration[] = JSON.parse(fs.readFileSync(configPath, 'utf8'))["tracesReader.configurations"];
	

	let toBeDecoratedEditors: vscode.TextEditor[];
	let decoratedEditors: vscode.TextEditor[];
	let decorations: vscode.TextEditorDecorationType[][] = [];

	function threadsDecoration(configurations: Configuration[]): void {

		const tids = new Set<string>();
		toBeDecoratedEditors.forEach(todoEditor => {
			const paths = configurations[0].paths
			if (!Array.isArray(paths)) { return; }
			if (!paths.some(path => minimatch(vscode.workspace.asRelativePath(todoEditor.document.fileName), path))) { return; }
			for (let line = 0; line < todoEditor.document.lineCount; line++) {
				const reg = new RegExp(configurations[0].lineReg!);
				const match = todoEditor.document.lineAt(line).text.match(reg);
				if (match) {
					tids.add(match[4]+'\\|');
				}
			}
		});
		const rules: Rule[] = [];
		const tidsArray = Array.from(tids);
		const colors = Array.of( Color.magenta,Color.blue,Color.brightGreen,Color.cyan,Color.brightMagenta,Color.brightBlue,Color.green,Color.brightCyan,Color.brightRed) 
		tidsArray.forEach((tid, index) => {
			const i = index % colors.length;
			rules.push({
				patterns: [tid],
				color: colors[i],
			});
		});
		configurations[0].rules = configurations[0].rules?.concat(rules);
	}

	function clearDecorations(configurations: Configuration[]): void {
		toBeDecoratedEditors = vscode.window.visibleTextEditors.slice();
		decoratedEditors = [];

		toBeDecoratedEditors.forEach(todoEditor => {
			decorations.flat().forEach(decorationType => {
				todoEditor.setDecorations(decorationType, []);
			});
		});

		threadsDecoration(configurations);

		decorations = !Array.isArray(configurations)
			? []
			: configurations.map(configuration => {
				return !Array.isArray(configuration.rules)
					? []
					: configuration.rules.map(rule => {
						return vscode.window.createTextEditorDecorationType({
							color: !Object.values(Color).includes(rule.color!) ? undefined : new vscode.ThemeColor('terminal.ansi' + rule.color),
							fontWeight: typeof rule.bold !== 'boolean' ? undefined : rule.bold ? 'bold' : 'normal',
							fontStyle: typeof rule.italic !== 'boolean' ? undefined : rule.italic ? 'italic' : 'normal',
							textDecoration:
								rule.underline === true && rule.strikeThrough === true ? 'underline line-through' :
								rule.underline === true ? 'underline' :
								rule.strikeThrough === true ? 'line-through' :
								rule.underline === false || rule.strikeThrough === false ? 'none' :
								undefined,
						});
					});
			});
	}

	function updateDecorations(configurations: Configuration[]): void {
		if (decorations.flat().length === 0) { return; }
		if (toBeDecoratedEditors.length === 0) { return; }

		if (!Array.isArray(configurations)) { return; }

		toBeDecoratedEditors.forEach(todoEditor => {
			const applicableConfigurations = configurations.filter(configuration =>
				Array.isArray(configuration.paths) && configuration.paths.some(path => {
					if (typeof path !== 'string') { return false; }
					const pattern = path.includes('/') || path.includes('\\') ? path : '**/' + path;
					const options: IOptions = { nocase: process.platform === 'win32' };
					return minimatch(vscode.workspace.asRelativePath(todoEditor.document.fileName), pattern, options);
				}));

			if (applicableConfigurations.length === 0) { return; }

			applicableConfigurations.forEach(configuration =>
				Array.isArray(configuration.rules) && configuration.rules?.forEach(rule => {
					const ranges: vscode.Range[] = [];

					Array.isArray(rule.patterns) && rule.patterns.forEach(pattern => {
						if (typeof pattern !== 'string') { return; }

						let regExp: RegExp;
						try {
							regExp = new RegExp(pattern, rule.matchCase === true ? 'gu' : 'giu');
						} catch (e) {
							return;
						}

						for (let line = 0; line < todoEditor.document.lineCount; line++) {
							for (const match of todoEditor.document.lineAt(line).text.matchAll(regExp)) {
								if (match.index === undefined || match[0].length === 0) { continue; }
								ranges.push(new vscode.Range(line, match.index, line, match.index + match[0].length -1));
							}
						}
					});
					
					const decorationType = decorations[configurations.indexOf(configuration)][configuration.rules!.indexOf(rule)];
					todoEditor.setDecorations(decorationType, ranges);
				}));

			decoratedEditors.push(todoEditor);
		});

		toBeDecoratedEditors = [];
	}

	while (configurations.length === 0) {
		console.log('No configurations found. Waiting for configurations to be loaded...');
	}

	vscode.workspace.onDidChangeConfiguration(
		event => {
			if (event.affectsConfiguration('colorMyText.configurations')) {
				clearDecorations(configurations);
			}
		},
		null,
		context.subscriptions);

	vscode.window.onDidChangeVisibleTextEditors(
		visibleEditors => {
			toBeDecoratedEditors = visibleEditors.filter(visibleEditor => !decoratedEditors.includes(visibleEditor));
			decoratedEditors = decoratedEditors.filter(doneEditor => visibleEditors.includes(doneEditor));
		},
		null,
		context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(
		event => {
			vscode.window.visibleTextEditors.forEach(visibleEditor => {
				if (visibleEditor.document === event.document && !toBeDecoratedEditors.includes(visibleEditor)) {
					toBeDecoratedEditors.push(visibleEditor);
				}
			});

			decoratedEditors = decoratedEditors.filter(doneEditor => !toBeDecoratedEditors.includes(doneEditor));
		},
		null,
		context.subscriptions);

		
		clearDecorations(configurations);
		setInterval(()=>updateDecorations(configurations),1000);
}


