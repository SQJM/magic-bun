import { createSimpleDomElement } from '../util/create-simple-dom-element.ts';
import { project } from './global.ts';

function escapeHtmlAttr(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlText(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class IndexDom {
	headString: string = '';
	bodyString: string = '';
	headFrontString: string = '';

	add(
		load: string,
		element: {
			tag: string;
			attrs: Array<Record<string, string>>;
			one?: boolean;
		}
	): void {
		const elementString = createSimpleDomElement(element);
		if (load === 'end') {
			this.bodyString += `${elementString}\n`;
		} else if (load === 'front') {
			this.headFrontString += `${elementString}\n`;
		} else if (load === 'begin') {
			this.headString += `${elementString}\n`;
		}
	}

	generate(): string {
		const icon = (() => {
			if (project.app_config.icon) return `<link rel="icon" type="image/png" href="${escapeHtmlAttr(project.app_config.icon)}">`;
			return '';
		})();
		const escapedTitle = escapeHtmlText(project.app_config.title);
		const escapedLang = escapeHtmlAttr(project.app_config.lang);
		let headFront = this.headFrontString;
		let head = this.headString;
		let body = this.bodyString;

		project.app_config.import.forEach((item: { o: { load?: string; element: string } }) => {
			const o = item['o'];
			if (o.load) {
				if (o.load === 'end') {
					body += `${o.element}\n`;
				} else if (o.load === 'front') {
					headFront += `${o.element}\n`;
				} else {
					head += `${o.element}\n`;
				}
			} else {
				head += `${o.element}\n`;
			}
		});

		return `<!DOCTYPE html>
<html lang="${escapedLang}">

<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=0" />
<title>${escapedTitle}</title>
${icon}
<link href="./magic/default-theme-var.css" rel="stylesheet"/>
<link href="./magic/runtime.css" rel="stylesheet"/>
<script src="./magic/runtime.js"></script>
${headFront}
${head}
</head>

<body>
<m-cache-element></m-cache-element>
<div id="app"></div>
${body}
<script>
${(() => {
		const is = project.app_config.initScript;
		const r = `magic.init("${project.build_config.config.main}");`;
		if (is === null || is === '') return r;
		return is.replace('$INIT$', r);
	})()}
</script>

</body>

</html>`;
	}
}
