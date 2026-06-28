/*#__PURE__*/
window["magic"] = (function () {
	window["__MAGIC__"] = {
		M: {},
		CREATE_ELEMENT_LIST: new Map()
	};

	/*#__PURE__*/

	var hasOwn = Object.prototype.hasOwnProperty.call.bind(Object.prototype.hasOwnProperty);

	window.onerror = null;
	window.addEventListener("unhandledrejection", null);

	var errorCollector = (function () {
			var errors = [];
			var errorMap = {};
			var errorHandlers = [];
			var overlay = null;
			var card = null;
			var listContainer = null;
			var footer = null;
			var counterEl = null;
			var domReady = false;

		function getErrorKey(err) {
			return (err.name || "Error") + "\n" + (err.message || String(err));
		}

		function onDomReady() {
			domReady = true;
			if (errors.length === 0) return;
			if (!ensureOverlay()) return;
			for (var i = 0; i < errors.length; i++) {
				var key = errors[i];
				var item = errorMap[key];
				renderError(item.err);
				item.entry = listContainer.lastChild;
				if (item.count > 1) updateCountBadge(item.entry, item.count);
			}
			counterEl.textContent = errors.length + " \u4E2A\u9519\u8BEF";
		}

		if (document.readyState === "complete" || document.readyState === "interactive") {
			onDomReady();
		} else {
			document.addEventListener("DOMContentLoaded", onDomReady);
		}

		function tearDown() {
			document.documentElement.classList.remove("dialog-open");
			overlay = null;
			card = null;
			listContainer = null;
			footer = null;
			counterEl = null;
			errors = [];
			errorMap = {};
		}

		function ensureOverlay() {
			if (overlay) return true;
			if (!document.body) return false;

			overlay = document.createElement("dialog");
			overlay.id = "magic-error-overlay";

			card = document.createElement("div");
			card.className = "m-err-card";

			var header = document.createElement("div");
			header.className = "m-err-header";

			var hLeft = document.createElement("div");
			hLeft.className = "m-err-header-l";

			var icon = document.createElement("span");
			icon.className = "m-err-icon";
			icon.textContent = "\u26A0";

			var title = document.createElement("h2");
			title.className = "m-err-title";
			title.textContent = "\u53D1\u751F\u9519\u8BEF";

			counterEl = document.createElement("span");
			counterEl.className = "m-err-count";

			hLeft.appendChild(icon);
			hLeft.appendChild(title);
			hLeft.appendChild(counterEl);

			header.appendChild(hLeft);
			card.appendChild(header);

			listContainer = document.createElement("div");
			listContainer.className = "m-err-list";
			card.appendChild(listContainer);

			footer = document.createElement("div");
			footer.className = "m-err-footer";

			var copyBtn = document.createElement("button");
			copyBtn.className = "m-err-copy";
			copyBtn.textContent = "\u590D\u5236\u9519\u8BEF";
			copyBtn.onclick = copyErrorsAsJson;
			footer.appendChild(copyBtn);

			var reloadBtn = document.createElement("button");
			reloadBtn.className = "m-err-reload";
			reloadBtn.textContent = "\u5237\u65B0\u9875\u9762";
			reloadBtn.onclick = function () { location.reload(); };
			footer.appendChild(reloadBtn);

			card.appendChild(footer);
			overlay.appendChild(card);
			document.body.appendChild(overlay);
			document.documentElement.classList.add("dialog-open");
			overlay.addEventListener("close", function () {
				overlay.remove();
				tearDown();
			});
			overlay.showModal();
			return true;
		}

		function push(err) {
			if (domReady) {
				for (var i = 0; i < errorHandlers.length; i++) {
					if (errorHandlers[i](err) === false) return;
				}
			} else {
				console.error(err);
			}

			var key = getErrorKey(err);

			if (errorMap[key]) {
				errorMap[key].count++;
				if (domReady && errorMap[key].entry) {
					updateCountBadge(errorMap[key].entry, errorMap[key].count);
				}
				return;
			}

			errorMap[key] = { err: err, count: 1, entry: null };
			errors.push(key);

			if (!domReady) return;
			if (!ensureOverlay()) return;
			renderError(err);
			errorMap[key].entry = listContainer.lastChild;
			counterEl.textContent = errors.length + " \u4E2A\u9519\u8BEF";
		}

		function updateCountBadge(entry, count) {
			var badge = entry.querySelector(".m-err-count-badge");
			badge.textContent = "\u00D7" + count;
		}

		function copyErrorsAsJson() {
			var payload = errors.map(function (key) {
				var item = errorMap[key];
				var err = item.err;
				var plain = {};
				Object.getOwnPropertyNames(err).forEach(function (k) {
					if (k === "stack") return;
					plain[k] = err[k];
				});
				return {
					name: err.name || "Error",
					message: err.message || String(err),
					stack: err.stack || null,
					file: err.__magic_file || null,
					line: err.__magic_line || null,
					col: err.__magic_col || null,
					count: item.count,
					properties: plain
				};
			});
			var text = JSON.stringify({
				collectedAt: new Date().toISOString(),
				userAgent: navigator.userAgent,
				url: location.href,
				count: errors.length,
				errors: payload
			}, null, 2);

			var done = function () {
				var hint = document.createElement("span");
				hint.className = "m-err-copy-hint";
				hint.textContent = "\u5DF2\u590D\u5236";
				footer && footer.appendChild(hint);
				setTimeout(function () { hint.remove(); }, 1500);
			};

			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
			} else {
				fallbackCopy(text);
				done();
			}
		}

		function fallbackCopy(text) {
			var ta = document.createElement("textarea");
			ta.value = text;
			ta.style.position = "fixed";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.select();
			try { document.execCommand("copy"); } catch (e) {}
			ta.remove();
		}

		function renderError(err) {
			var entry = document.createElement("div");
			entry.className = "m-err-entry";

			var head = document.createElement("div");
			head.className = "m-err-head";

			var badge = document.createElement("span");
			badge.className = "m-err-badge";
			badge.textContent = err.name || "Error";

			var msg = document.createElement("span");
			msg.className = "m-err-msg";
			var text = err.message || String(err);
			if (text.length > 100) text = text.substring(0, 100) + "...";
			msg.textContent = text;

			var countBadge = document.createElement("span");
			countBadge.className = "m-err-count-badge";

			head.appendChild(badge);
			head.appendChild(msg);
			head.appendChild(countBadge);

			var errBlock = document.createElement("div");
			errBlock.className = "m-err-block";

			var errType = document.createElement("div");
			errType.className = "m-err-type";
			errType.textContent = err.name || "Error";

			var errMsg = document.createElement("div");
			errMsg.className = "m-err-message";
			errMsg.textContent = err.message || String(err);

			errBlock.appendChild(errType);
			errBlock.appendChild(errMsg);

			var body = document.createElement("div");
			body.className = "m-err-body";
			body.appendChild(errBlock);

			if (err.__magic_file || err.__magic_line) {
				var locStr = err.__magic_file || "";
				if (err.__magic_line) { locStr += ":" + err.__magic_line; if (err.__magic_col) locStr += ":" + err.__magic_col; }
				var loc = document.createElement("div");
				loc.className = "m-err-location";
				loc.textContent = "\u4F4D\u7F6E: " + locStr;
				body.appendChild(loc);
			}

			var stackLabel = document.createElement("div");
			stackLabel.className = "m-err-stack-label";
			stackLabel.textContent = "\u9519\u8BEF\u5806\u6808";
			body.appendChild(stackLabel);

			var stackContent = document.createElement("pre");
			stackContent.className = "m-err-stack";
			stackContent.textContent = err.stack || "\u65E0\u5806\u6808\u4FE1\u606F";
			body.appendChild(stackContent);

			entry.appendChild(head);
			entry.appendChild(body);
			listContainer.appendChild(entry);
		}

		function onError(handler) {
			errorHandlers.push(handler);
		}

		return { push: push, onError: onError };
	})();

	window.onerror = function (message, source, lineno, colno, error) {
		var err = error;
		if (!err) {
			err = new Error(message);
			err.name = "\u672A\u6355\u83B7\u9519\u8BEF";
		}
		err.__magic_file = source || "";
		err.__magic_line = lineno || 0;
		err.__magic_col = colno || 0;
		errorCollector.push(err);
		return true;
	};

	window.addEventListener("unhandledrejection", function (event) {
		var error = event.reason;
		if (error instanceof Error) {
			errorCollector.push(error);
		} else {
			errorCollector.push(new Error(String(error)));
		}
	});

	function pushError(err) {
		errorCollector.push(err);
	}

	function errorBoundary(fn, fallbackUI) {
		return function () {
			var args = arguments;
			try {
				return fn.apply(this, args);
			} catch (error) {
				pushError(error);

				if (typeof fallbackUI === "function") {
					try {
						return fallbackUI(error);
					} catch (e) {
						pushError(e);
					}
				}
				return null;
			}
		};
	}

	function wrapWithErrorBoundary(scope, fn, componentName) {
		return function () {
			var args = arguments;
			try {
				return fn.apply(scope, args);
			} catch (error) {
				var errorWithContext = new Error(error.message);
				errorWithContext.name = componentName || "Component";
				errorWithContext.stack = error.stack;
				pushError(errorWithContext);

				return null;
			}
		};
	}

	function idGenerate() {
		return "m-id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	}

	const call = function (scope) {
		return {
			interface: new Proxy(scope, {
				get(target, prop, receiver) {
					return Reflect.get(scope["__magic_interface"], prop, receiver);
				},
				set() {
					return false;
				}
			}),
			component_interface: new Proxy(scope, {
				get(target, prop, receiver) {
					return Reflect.get(scope["__magic_component_interface"] || {}, prop, receiver);
				},
				set() {
					return false;
				}
			}),
			event: new Proxy(scope, {
				get(target, prop, receiver) {
					return Reflect.get(scope["__magic_event"], prop, receiver);
				},
				set() {
					return false;
				}
			}),
			listen: new Proxy(scope, {
				get(target, prop) {
					return scope[`__magic_listen_${prop}`];
				},
				set() {
					return false;
				}
			})
		}
	};

	const emit = {
		event: function (listen, exposeEvent) {
			return (name, ...args) => {
				if (exposeEvent && !hasOwn(exposeEvent, name)) {
					throw new Error(`emit_event("${name}"): 事件未在 exposeEvent 中声明`);
				}
				if (hasOwn(listen, name)) {
					return listen[name](...args);
				}
			}
		}
	};

	const dom = (() => {
		function element(tag) {
			const r = document.createElement(tag);
			r.__MAGIC_CREATE_ELEMENT__ = true;
			return r;
		}

		function text(content) {
			return document.createTextNode(content);
		}

		function append(p, ...childs) {
			const bool = p.templateArgs && p.templateArgs.inline && p.childNodes.length > 0;
			if (bool && p.interface._inline) {
				p.interface._inline(...childs);
				return;
			}
			for (const c of childs) {
				const child = (() => {
					if (c.fragment) return c.fragment;
					else return c;
				})();
				if (bool) {
					p.childNodes.item(0).appendChild(child);
				} else {
					p.appendChild(child);
				}
			}
		}

		function attribute(e, atts) {
			for (var key in atts) {
				if (!hasOwn(atts, key)) continue;
				if (key === "class") {
					atts[key].split(" ").forEach(function (s) {
						e.classList.add(s);
					});
				} else {
					if (e["__fragment"] && e["mid"]) {
						e.childNodes[0].setAttribute(key, atts[key] || "");
					} else {
						e.setAttribute(key, atts[key] || "");
					}
				}
			}
		}

		function event(e, eventName, _this, fnName, opt) {
			e.addEventListener(eventName, _this.__magic_event[fnName], opt);
		}

		return {
			element,
			text,
			attribute,
			event,
			append
		}
	})();

	function created(...elements) {
		function safeCreated(el) {
			try {
				if (el && el.__magic_component_event && typeof el.__magic_component_event.created === "function") {
					el.__magic_component_event.created();
				}
			} catch (error) {
				pushError(error);
			}
		}

		elements.forEach(function (el) {
			safeCreated(el);
		});
		setTimeout(function () {
			elements.forEach(function (el) {
				try {
					observeLifecycle(el);
				} catch (error) {
					pushError(error);
				}
				var children = collectChildComponents(el);
				children.forEach(function (child) {
					safeCreated(child);
					try {
						observeLifecycle(child);
					} catch (error) {
						pushError(error);
					}
				});
			});
		}, 0);
	}

	function observeLifecycle(el) {
		if (!el || !el.__magic_component_event) return;

		var rootEl = el.__fragment ? el.childNodes[0] : el;
		if (!rootEl || rootEl.nodeType !== 1) return;

		el.__lifecycle_observers = [];

		var scope = el.__SCOPE__ || (el.__fragment && el.childNodes.length > 0 ? el.childNodes[0].__SCOPE__ : null);
		if (scope) scope.__magic_lifecycle_observers = el.__lifecycle_observers;

		if (typeof el.__magic_component_event.destroy === "function") {
			var parent = rootEl.parentNode;
			if (parent) {
				var destroyObs = new MutationObserver(function () {
					if (!document.contains(rootEl)) {
						if (!rootEl.__magic_disposed) {
							el.__magic_component_event.destroy();
						}
						destroyEl(el);
					}
				});
				destroyObs.observe(parent, { childList: true, subtree: true });
				el.__lifecycle_observers.push(destroyObs);
			}
		}

		if (typeof el.__magic_component_event.visibleChange === "function") {
			if (window.IntersectionObserver) {
				var visObs = new IntersectionObserver(function (entries) {
					entries.forEach(function (entry) {
						el.__magic_component_event.visibleChange(entry.isIntersecting);
					});
				});
				visObs.observe(rootEl);
				el.__lifecycle_observers.push(visObs);
			}
		}
	}

	function destroyEl(el) {
		if (el.__lifecycle_observers) {
			el.__lifecycle_observers.forEach(function (obs) {
				if (typeof obs.disconnect === "function") obs.disconnect();
			});
			el.__lifecycle_observers = null;
		}
		if (el.__lifecycle_timer) {
			clearTimeout(el.__lifecycle_timer);
		}
	}

	function collectChildComponents(element, results) {
		if (!element || !element.childNodes) return;
		results = results || [];
		for (var i = 0; i < element.childNodes.length; i++) {
			var child = element.childNodes[i];
			if (child.nodeType !== 1) continue;
			if (child.__magic_component_event) {
				results.push(child);
			}
			if (child.childNodes && child.childNodes.length > 0) {
				collectChildComponents(child, results);
			}
		}
		return results;
	}

	function initComponentInterface(scope) {
		scope.__magic_component_interface = scope.__magic_component_interface || {};
		scope.__magic_component_interface.setVisible = function (visible) {
			var el = scope.__magic_template.export_element().at(0);
			if (el) {
				if (visible) el.classList.remove("m-visible-false");
				else el.classList.add("m-visible-false");
			}
		};
		scope.__magic_component_interface.refresh = function () {
			scope.__magic_template.render();
		};
		scope.__magic_component_interface.dispose = function () {
			if (scope.__magic_disposed) return;
			scope.__magic_disposed = true;
			if (scope.__magic_lifecycle_observers) {
				scope.__magic_lifecycle_observers.forEach(function (obs) {
					if (typeof obs.disconnect === "function") obs.disconnect();
				});
				scope.__magic_lifecycle_observers = null;
			}
			var exports = scope.__magic_template.export_element();
			for (var i = 0; i < exports.length; i++) {
				if (exports[i]) exports[i].__magic_disposed = true;
			}
			var children = collectChildComponents(scope.__magic_element_root);
			for (var j = 0; j < children.length; j++) {
				var child = children[j];
				if (child.__magic_component_interface && typeof child.__magic_component_interface.dispose === "function") {
					child.__magic_component_interface.dispose();
				}
			}
			if (scope.__magic_component_event && typeof scope.__magic_component_event.destroy === "function")
				scope.__magic_component_event.destroy();
			if (scope.__magic_element_root && scope.__magic_element_root.parentNode) {
				scope.__magic_element_root.parentNode.removeChild(scope.__magic_element_root);
			}
		};
	}

	function importM(name, args = {}, listen = {}) {
		name = name.replace(/[^a-zA-Z]/g, '_').toLowerCase();
		if (hasOwn(window["__MAGIC__"]["M"], name)) {
			return new window["__MAGIC__"]["M"][name](args, listen);
		} else {
			throw new Error(`未知的 ${name}`);
		}
	}

	function $id(_$id) {
		const createNameFinder = (element) => (name) => {
			const findChildByName = (parent) => {
				for (const child of parent.childNodes) {
					if (child.nodeType !== 1) continue;
					if (child._$name === name) return child;
					if (child._$id) continue;

					const found = findChildByName(child);
					if (found) return found;
				}
				return null;
			};
			return findChildByName(element);
		};

		const convertIdMapToObject = (map) => {
			const result = {};
			map.forEach((value, key) => {
				const formattedKey = `$${key.replace(/-(\w)/g, (_, c) => c.toUpperCase())}`;
				value.$name = createNameFinder(value);
				result[formattedKey] = value;
			});
			return result;
		};

		return (id) => {
			if (id === undefined) {
				return convertIdMapToObject(_$id);
			}

			const target = _$id.get(id);
			if (!target) throw new Error(`没有 id 为 ${id} 的元素`);

			target.$name = createNameFinder(target);
			return target;
		};
	}

	var midCache = {};

	function $(id, root) {
		if (!id || typeof id !== 'string' || !root || root.nodeType !== 1) {
			return null;
		}
		if (root === undefined) root = document.body;

		if (midCache[id] && document.contains(midCache[id])) {
			return midCache[id];
		}

		const stack = [root];

		while (stack.length > 0) {
			const element = stack.pop();

			// 检查当前元素
			if (element.mid === id) {
				return element;
			}

			// 将子元素推入栈(从后往前推,保持搜索顺序)
			const children = element.children;
			for (let i = children.length - 1; i >= 0; i--) {
				stack.push(children[i]);
			}
		}

		return null;
	}

	function parserArgs(args) {
		if (typeof args === "string") {
			if (args.length > 102400) throw new Error("args too large");
			return JSON.parse(args);
		}

		var BLOCKED_KEYS = { __proto__: true, constructor: true, prototype: true };

		function deepTransform(obj) {
			var result = {};
			for (var key in obj) {
				if (!hasOwn(obj, key)) continue;
				if (BLOCKED_KEYS[key]) continue;
				var value = obj[key];
				if (typeof value === 'object' && value !== null) {
					value = deepTransform(value);
				}
				if (key.indexOf(':') !== -1) {
					var keys = key.split(':');
					var current = result;
					for (var i = 0; i < keys.length; i++) {
						var k = keys[i];
						if (BLOCKED_KEYS[k]) break;
						if (i === keys.length - 1) {
							current[k] = value;
						} else {
							if (!(k in current)) current[k] = {};
							current = current[k];
						}
					}
				} else {
					result[key] = value;
				}
			}
			return result;
		}

		return deepTransform(args);
	}

	function createArgs(obj) {
		return JSON.stringify(obj);
	}

	function createUiData(target = {}, source = {}) {
		function _getType(val) {
			return Object.prototype.toString.call(val).slice(8, -1);
		}

		function _convertType(t, s = "") {
			const type = _getType(t);
			let result = s;
			switch (type) {
				case "Boolean": {
					if (s === "true") result = true;
					else if (s === "false") result = false;
					else throw new Error(`[UiData] 无效的布尔值: ${s}`);
					break;
				}
				case "Number": {
					if (s.includes(".")) result = parseFloat(s);
					else result = parseInt(s);
					break;
				}
				case "Array": {
					if (s.length > 10240) throw new Error("[UiData] 数组数据过大");
					result = JSON.parse(s);
					break;
				}
				case "RegExp": {
					const parts = s.match(/^\/(.+?)\/([gimuy]*)$/);
					if (!parts) throw new Error(`[UiData] 无效的正则表达式: ${s}`);
					result = new RegExp(parts[1], parts[2]);
					break;
				}
			}
			return result;
		}

		for (const key in source) {
			if (hasOwn(source, key)) {
				const sourceValue = source[key];
				const targetValue = target[key];

				if (typeof sourceValue === 'object' && sourceValue !== null && typeof targetValue === 'object' && targetValue !== null) {
					createUiData(targetValue, sourceValue);
				} else {
					try {
						target[key] = _convertType(targetValue, sourceValue, key);
					} catch (e) {
						throw new Error(`[UiData] 给 ${key} 传入的键值类型与目标键类型不符合`);
					}
				}
			}
		}

		const bindings = {};

		function createDeepProxy(t, path) {
			if (!t || typeof t !== 'object') {
				return t;
			}
			if (path === undefined) path = '';

			const handler = {
				get(t, prop, receiver) {
					const value = Reflect.get(t, prop, receiver);
					const currentPath = path ? path + '.' + prop : prop;

					if (value && typeof value === 'object') {
						return createDeepProxy(value, currentPath);
					}

					return value;
				},

				set(t, prop, newValue, receiver) {
					const currentPath = path ? path + '.' + prop : prop;

					if (hasOwn(bindings, currentPath)) {
						bindings[currentPath].forEach(n => {
							n.textContent = newValue;
						});
					}

					if (newValue && typeof newValue === 'object') {
						newValue = createDeepProxy(newValue, currentPath);
					}

					return Reflect.set(t, prop, newValue, receiver);
				}
			};

			return new Proxy(t, handler);
		}

		/**
		 * 动态值绑定初始化函数
		 */
		target.__DynamicValueBind = function (bindingMap) {
			if (!bindingMap || typeof bindingMap !== 'object') {
				console.warn('[UiData] __DynamicValueBind 需要接收一个对象参数');
				return this;
			}

			for (const key in bindingMap) {
				if (hasOwn(bindingMap, key)) {
					const textNodes = bindingMap[key];

					if (!Array.isArray(textNodes)) {
						console.warn(`[UiData] 键 "${key}" 的值必须是数组`);
						continue;
					}

					const validTextNodes = textNodes.filter(node =>
						node && node.nodeType === 3
					);

					if (validTextNodes.length === 0) {
						console.warn(`[UiData] 键 "${key}" 没有有效的文本节点`);
						continue;
					}

					if (!bindings[key]) {
						bindings[key] = [];
					}
					bindings[key].push(...validTextNodes);

					const value = this._getValueByPath(key);
					if (value !== undefined) {
						validTextNodes.forEach(node => {
							node.textContent = value;
						});
					}
				}
			}

			return this;
		};

		/**
		 * 辅助方法:通过路径获取值
		 * @param {string} path - 属性路径,如 "user.name"
		 * @returns {*} - 路径对应的值
		 */
		target._getValueByPath = function (path) {
			const parts = path.split('.');
			let current = target;

			for (const part of parts) {
				if (current === null || current === undefined) {
					return undefined;
				}
				current = current[part];
			}

			return current;
		};
		return createDeepProxy(target);
	}

	function parserListen(listen) {
		return listen || {};
	}

	var eventRunState = new WeakMap();

	function on_event(event, listen) {
		if (!event || !listen || !hasOwn(listen, event.type)) return;
		eventRunState.set(event, "on");
		return listen[event.type](event);
	}

	function end_event(event, listen) {
		if (!event || !listen || !hasOwn(listen, event.type)) return;
		eventRunState.set(event, "end");
		return listen[event.type](event);
	}

	function mapIdElement() {
		var store = {};
		function s(id, e, cssScope) {
			e._$id = id;
			if (cssScope && e.__fragment) {
				var firstChild = e.childNodes.item(0);
				if (firstChild && firstChild.nodeType === 1) firstChild.classList.add(cssScope);
			} else if (cssScope) {
				e.classList.add(cssScope);
			}
			store[id] = e;
		}
		return {
			s: s,
			get: function (id) { return store[id]; },
			set: function (id, e) { s(id, e); },
			forEach: function (fn) {
				for (var key in store) { if (hasOwn(store, key)) fn(store[key], key); }
			},
			get size() {
				var count = 0;
				for (var key in store) { if (hasOwn(store, key)) count++; }
				return count;
			}
		};
	}

	function exportInterface(scope, target, parcel) {
		function fn(si) {
			for (const pKey in parcel) {
				if (hasOwn(scope[si], pKey)) {
					throw new Error("导出的接口存在: " + pKey);
				}
				if (parcel[pKey] === null) {
					scope[si][pKey] = target.interface[pKey];
				} else if (typeof parcel[pKey] === "function") {
					scope[si][pKey] = (...args) => {
						target.interface[pKey](parcel[pKey](...args));
					};
				}
			}
		}

		if (scope.__magic_interface) {
			fn("__magic_interface");
		} else if (scope.interface) {
			fn("interface");
		}
	}

	function GetInterface(ele) {
		if (ele.__SCOPE__) {
			return ele.__SCOPE__.__magic_interface;
		}
		return null;
	}

	var messageBus = (function () {
		var listeners = new Map();  // Map<messageType, Map<element, callback>>
		var observer = null;

		function ensureObserver() {
			if (observer) return;
			if (!document.body) {
				document.addEventListener("DOMContentLoaded", function () {
					startObserving();
				});
				return;
			}
			startObserving();
		}

		function startObserving() {
			observer = new MutationObserver(function (mutations) {
				for (var i = 0; i < mutations.length; i++) {
					var removed = mutations[i].removedNodes;
					for (var j = 0; j < removed.length; j++) {
						var node = removed[j];
						if (node.nodeType === 1) {  // Element node
							cleanupNode(node);
						}
					}
				}
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
		}

		function cleanupNode(node) {
			var found = false;
			listeners.forEach(function (typeListeners, messageType) {
				// 如果这个元素本身有监听器
				if (typeListeners.has(node)) {
					typeListeners.delete(node);
					found = true;
				}
				// 清理已断开连接的监听器(用 contains 兜底检查)
				typeListeners.forEach(function (cb, el) {
					if (!document.documentElement.contains(el)) {
						typeListeners.delete(el);
						found = true;
					}
				});
				if (typeListeners.size === 0) {
					listeners.delete(messageType);
				}
			});
			return found;
		}

		return {
			/**
			 * 注册消息监听.
			 * @param {HTMLElement} element - 绑定的 HTML 元素(元素移除时自动注销)
			 * @param {string} messageType - 消息类型名
			 * @param {Function} callback - 回调函数,接收 (data)
			 * @param {boolean} [autoOff] - 可选,设为 true 时触发一次后自动注销
			 * @returns {Function} 取消监听的函数
			 */
			on: function (element, messageType, callback, autoOff) {
				if (!element || typeof messageType !== "string" || typeof callback !== "function") {
					throw new Error("magic.message.on: 参数无效,需要 (element, messageType, callback, autoOff?)");
				}
				if (!listeners.has(messageType)) {
					listeners.set(messageType, new Map());
				}
				var typeListeners = listeners.get(messageType);
				// 同一元素重复注册同一消息类型会覆盖旧回调
				if (autoOff === true) {
					var self = this;
					var wrapped = function (data) {
						self.off(element, messageType);
						callback(data);
					};
					wrapped._magic_autoOff = true;
					typeListeners.set(element, wrapped);
				} else {
					typeListeners.set(element, callback);
				}
				ensureObserver();

				var self = this;
				return function () {
					self.off(element, messageType);
				};
			},

			/**
			 * 取消消息监听.
			 * @param {HTMLElement} element - 绑定的 HTML 元素
			 * @param {string} messageType - 消息类型名
			 */
			off: function (element, messageType) {
				if (listeners.has(messageType)) {
					var typeListeners = listeners.get(messageType);
					typeListeners.delete(element);
					if (typeListeners.size === 0) {
						listeners.delete(messageType);
					}
				}
			},

			/**
			 * 发送消息到所有监听者.
			 * @param {string} messageType - 消息类型名
			 * @param {*} data - 消息数据(任意 JSON 可序列化值)
			 */
			emit: function (messageType, data) {
				if (!listeners.has(messageType)) return;
				var typeListeners = listeners.get(messageType);
				var toRemove = [];

				typeListeners.forEach(function (callback, element) {
					if (document.documentElement && document.documentElement.contains(element)) {
						try {
							callback(data);
						} catch (e) {
							console.error("[magic.message] \u76D1\u542C\u51FD\u6570\u6267\u884C\u51FA\u9519:", e);
						}
					} else {
						toRemove.push(element);
					}
				});

				// 清理已断开连接的监听器
				for (var i = 0; i < toRemove.length; i++) {
					typeListeners.delete(toRemove[i]);
				}
				if (typeListeners.size === 0) {
					listeners.delete(messageType);
				}
			}
		};
	})();

	function BindScope(arr, ths, id) {
		const bindScope = (element) => {
			Object.defineProperty(element, '__SCOPE__', {
				value: ths,
				writable: false,
				configurable: true
			});
			element.__MAGIC_MODULE_ID = id;
			if (id) midCache[id] = element;
			return element;
		};

		if (arr.length === 0) {
			arr.push({});
		}

		return arr.map(bindScope);
	}

	const replaceMagicComments = (() => {
		// 缓存正则表达式(模块级常量)
		const MAGIC_PATTERN = /(\\)?\$(\{([^}]*)\}|)/g;
		const COMMENT_PATTERN = /<!--MAGIC:DV\[(.*?)\]-->/g;

		/**
		 * 处理单个文本节点
		 * @param {Text} textNode - 要处理的文本节点
		 * @param {Object} resultMap - 结果收集对象
		 * @returns {boolean} - 是否处理成功
		 */
		function processTextNode(textNode, resultMap) {
			const content = textNode.textContent;
			let processed = '';
			let lastIndex = 0;
			let match;

			MAGIC_PATTERN.lastIndex = 0;

			while ((match = MAGIC_PATTERN.exec(content)) !== null) {
				if (match.index > lastIndex) {
					processed += content.substring(lastIndex, match.index);
				}

				if (match[1]) {
					// 转义的\$
					processed += '$';
					if (match[2]?.startsWith('{')) {
						processed += match[2];
					}
				} else if (match[3] !== undefined) {
					// ${xxx} 模式
					processed += `<!--MAGIC:DV[${match[3]}]-->`;
				} else {
					// 单独的$
					processed += '$';
				}

				lastIndex = match.index + match[0].length;
			}

			if (lastIndex < content.length) {
				processed += content.substring(lastIndex);
			}

			// 如果没有变化,返回false
			if (processed === content) return false;

			// 构建新内容
			const fragment = document.createDocumentFragment();
			let textStart = 0;

			COMMENT_PATTERN.lastIndex = 0;
			while ((match = COMMENT_PATTERN.exec(processed)) !== null) {
				if (match.index > textStart) {
					fragment.appendChild(
						document.createTextNode(processed.substring(textStart, match.index))
					);
				}

				// 创建注释节点
				const comment = document.createComment(`MAGIC:DV[${match[1]}]`);
				fragment.appendChild(comment);

				// 在注释后面创建一个空的文本节点
				const emptyTextNode = document.createTextNode(`{${match[1]}}`);
				fragment.appendChild(emptyTextNode);

				// 将空文本节点添加到结果映射中
				const key = match[1];
				if (!resultMap[key]) {
					resultMap[key] = [];
				}
				resultMap[key].push(emptyTextNode);

				textStart = match.index + match[0].length;
			}

			if (textStart < processed.length) {
				fragment.appendChild(
					document.createTextNode(processed.substring(textStart))
				);
			}

			// 执行替换
			try {
				textNode.parentNode.replaceChild(fragment, textNode);
				return true;
			} catch (e) {
				console.warn('替换文本节点失败:', e);
				return false;
			}
		}

		/**
		 * 收集需要处理的文本节点
		 * @param {Element} element - 根元素
		 * @returns {Text[]} - 文本节点数组
		 */
		function collectTextNodes(element) {
			const walker = document.createTreeWalker(
				element,
				NodeFilter.SHOW_TEXT,
				{
					acceptNode: (node) => {
						// 只处理包含$符号且非空的文本节点
						return node.textContent.trim() !== '' && node.textContent.includes('$')
							? NodeFilter.FILTER_ACCEPT
							: NodeFilter.FILTER_REJECT;
					}
				}
			);

			const textNodes = [];
			let currentNode;

			while ((currentNode = walker.nextNode())) {
				textNodes.push(currentNode);
			}

			return textNodes;
		}

		/**
		 * 处理所有文本节点
		 * @param {Element} element - 根元素
		 * @returns {Object} - 结果对象
		 */
		function processAllNodes(element) {
			const result = {};
			const textNodes = collectTextNodes(element);

			textNodes.forEach(node => {
				processTextNode(node, result);
			});

			return result;
		}

		/**
		 * Promise 版本的主函数
		 * @param {Element} element - 要处理的根元素
		 * @returns {Promise<Object>} - 返回 Promise,解析为结果对象
		 */
		return function (element) {

			return new Promise((resolve, reject) => {
				// 快速失败检查
				if (!element) {
					reject(new Error('元素不能为空'));
					return;
				}

				if (element.nodeType !== 1) {
					reject(new Error('元素必须是 Element 类型'));
					return;
				}

				// 处理函数
				const process = () => {
					try {
						const result = processAllNodes(element);
						resolve(result);
					} catch (error) {
						reject(error);
					}
				};

				// 使用 requestIdleCallback 或 setTimeout 来避免阻塞主线程
				if (window.requestIdleCallback) {
					requestIdleCallback(process, { timeout: 100 });
				} else {
					setTimeout(process, 0);
				}
			});
		};
	})();

	function DynamicValueBind(...ele) {
		const o = ele.pop();
		ele.forEach(node => {
			replaceMagicComments(node).then(r => {
				o.__DynamicValueBind(r)
			});
		})
	}

	const router = (() => {
		const routes = [];
		const routeComponents = {};
		let currentRoute = null;
		let currentElement = null;
		let rootContainer = null;
		const guards = [];
		const afterHooks = [];
		let mode = 'history';

		function getCurrentPath() {
			if (mode === 'hash') {
				return location.hash.slice(1) || '/';
			}
			return location.pathname;
		}

		function buildUrl(path) {
			if (mode === 'hash') {
				return '#' + path;
			}
			return path;
		}

		function pathToRegex(path) {
			const paramNames = [];
			const regexStr = path.replace(/:([^/]+)/g, (_, name) => {
				paramNames.push(name);
				return '([^/]+)';
			});
			return {
				regex: new RegExp(`^${regexStr}$`),
				params: paramNames
			};
		}

		function matchRoute(path) {
			for (const route of routes) {
				const { regex, params } = pathToRegex(route.path);
				const match = path.match(regex);
				if (match) {
					const paramValues = {};
					params.forEach((name, i) => {
						paramValues[name] = match[i + 1];
					});
					return {
						...route,
						params: paramValues,
						query: parseQuery(path)
					};
				}
			}
			return null;
		}

		function parseQuery(path) {
			const queryIndex = path.indexOf('?');
			if (queryIndex === -1) return {};
			const queryStr = path.slice(queryIndex + 1);
			const result = {};
			queryStr.split('&').forEach(pair => {
				const [key, value] = pair.split('=');
				try {
					result[decodeURIComponent(key)] = decodeURIComponent(value !== undefined ? value : '');
				} catch (_e) { /* malformed %-encoding, skip */ }
			});
			return result;
		}

		function extractPath(pathname) {
			const queryIndex = pathname.indexOf('?');
			return queryIndex === -1 ? pathname : pathname.slice(0, queryIndex);
		}

		async function executeGuards(to, from) {
			for (const guard of guards) {
				const result = await guard(to, from);
				if (result === false) return false;
				if (typeof result === 'string') {
					handleNavigation(result, true);
					return false;
				}
			}
			return true;
		}

		function renderRoute(route) {
			if (!rootContainer) return;

			const component = routeComponents[route.component];
			if (!component) {
				console.error(`Route component "${route.component}" not found`);
				return;
			}

			if (currentElement && currentElement.__magic_component_interface && typeof currentElement.__magic_component_interface.dispose === "function") {
				try { currentElement.__magic_component_interface.dispose(); } catch (_e) { /* ignore */ }
			}

			var args = {};
			if (route.params) Object.assign(args, route.params);
			if (route.query) Object.assign(args, route.query);

			currentElement = magic.importM(component, args);

			rootContainer.innerHTML = '';
			if (currentElement.fragment) {
				rootContainer.appendChild(currentElement.fragment);
			} else {
				rootContainer.appendChild(currentElement);
			}
			magic.created(currentElement);

			currentRoute = route;
		}

		function handleNavigation(path, replace) {
			if (path.length > 2000) {
				console.error("path too long:", path.length);
				return;
			}
			const pathname = extractPath(path);
			const route = matchRoute(pathname);

			if (!route) {
				console.error(`No route matched for path: ${path}`);
				return;
			}

			const from = currentRoute;
			executeGuards(route, from).then((canContinue) => {
				if (canContinue === false) return;

				if (mode === 'hash') {
					if (replace) {
						var href = location.href.replace(/#.*$/, '') + buildUrl(path);
						location.replace(href);
					} else {
						location.hash = path;
					}
				} else {
					if (replace) {
						history.replaceState(null, '', path);
					} else {
						history.pushState(null, '', path);
					}
				}
				renderRoute(route);

				afterHooks.forEach(function (hook) { hook(route, from); });
			});
		}

		return {
			getCurrentRoute() {
				return currentRoute;
			},

			addRoute(path, component) {
				routes.push({ path: path, component: component });
				routeComponents[component] = component;
			},

			addRoutes(routeList) {
				var self = this;
				routeList.forEach(function (r) { self.addRoute(r.path, r.component); });
			},

			init(containerId, options) {
				if (!options) options = {};
				mode = options.mode || 'history';
				rootContainer = document.getElementById(containerId);
				if (!rootContainer) {
					throw new Error(`Router container element "${containerId}" not found`);
				}

				if (mode === 'hash') {
					window.addEventListener('hashchange', function () {
						var path = getCurrentPath();
						var route = matchRoute(path);
						if (route) renderRoute(route);
					});
				} else {
					window.addEventListener('popstate', function () {
						var path = getCurrentPath();
						var route = matchRoute(path);
						if (route) renderRoute(route);
					});
				}

				this.navigate(getCurrentPath(), true);
			},

			navigate(path, replace) {
				handleNavigation(path, replace);
			},

			push(path) {
				handleNavigation(path, false);
			},

			replace(path) {
				handleNavigation(path, true);
			},

			back() {
				history.back();
			},

			forward() {
				history.forward();
			},

			go(n) {
				history.go(n);
			},

			beforeEach(guard) {
				guards.push(guard);
			},

			afterEach(hook) {
				afterHooks.push(hook);
			}
		};
	})();

	// ---- Lazy loader / code splitting ----
	var loadedChunks = Object.create(null);
	var pendingChunks = Object.create(null);

	function loadChunk(chunkName) {
		if (loadedChunks[chunkName]) {
			return loadedChunks[chunkName];
		}
		if (pendingChunks[chunkName]) {
			return new Promise(function (resolve, reject) {
				pendingChunks[chunkName].push({ resolve: resolve, reject: reject });
			});
		}
		pendingChunks[chunkName] = [];
		var promise = new Promise(function (resolve, reject) {
			var cssLink = document.createElement('link');
			cssLink.rel = 'stylesheet';
			cssLink.href = './magic/' + chunkName + '.css';
			cssLink.onerror = function () { cssLink.remove(); };
			document.head.appendChild(cssLink);
			var script = document.createElement('script');
			script.src = './magic/' + chunkName + '.js';
			script.onload = function () {
				loadedChunks[chunkName] = Promise.resolve();
				var queue = pendingChunks[chunkName];
				delete pendingChunks[chunkName];
				for (var i = 0; i < queue.length; i++) queue[i].resolve();
				resolve();
			};
			script.onerror = function () {
				var err = new Error('[magic-lazy] Failed to load chunk: ' + chunkName);
				var queue = pendingChunks[chunkName];
				delete pendingChunks[chunkName];
				for (var i = 0; i < queue.length; i++) queue[i].reject(err);
				reject(err);
			};
			document.head.appendChild(script);
		});
		return promise;
	}

	function lazyImport(moduleName) {
		return loadChunk(moduleName).then(function () {
			var factory = window.__MAGIC__ && window.__MAGIC__.M && window.__MAGIC__.M[moduleName];
			if (!factory) {
				throw new Error('[magic-lazy] Module "' + moduleName + '" not found after chunk load.');
			}
			return factory;
		});
	}

	/*#__PURE__*/
	function init(main) {
		Object.freeze(window["magic_version"]);
		Object.freeze(window["magic"]);

		console.log("%cMagic ヾ(๑╹◡╹))",
			"color:#ffffff;font-weight:bold;font-size:6em;padding:10px 30px;background: #31A9FF;");
		console.log("magic v" + magic_version);
		console.log("link https://www.npmjs.com/package/@love-sqjm/magic");

		const app = document.getElementById("app");
		if (!app) {
			console.error("Magic: 未找到 #app 容器元素");
			return;
		}

		try {
			const component = importM(main);
			if (!component || !component.fragment) {
				throw new Error("Magic: 入口组件返回无效");
			}
			app.appendChild(component.fragment);
			magic.created(component);
		} catch (e) {
			pushError(e);
		}
	}

	/*#__PURE__*/
	// ========== Stage A: 子模块初始化占位 ==========
	// 以下 API 由独立的 runtime 子模块 (scheduler.js / reactivity.js / ...) 挂载.
	// 此处定义 no-op 占位符,确保在子模块加载前 API 已存在(不会抛出 undefined).

	var noop = function () { return undefined; };
	var noopVoid = function () {};

	// Scheduler 占位
	var _nextTick = typeof queueMicrotask === 'function'
		? function (fn) { queueMicrotask(fn || noopVoid); }
		: function (fn) { setTimeout(fn || noopVoid, 0); };

	// 子模块加载后,这些占位符会被真实实现覆盖
	var _exposedScheduler = {
		queueJob: noopVoid,
		invalidateJob: noopVoid,
		flushQueue: noopVoid,
		nextTick: _nextTick,
		magic_nextTick: _nextTick
	};

	var _exposedReactivity = {
		ref: noop,
		shallowRef: noop,
		isRef: function () { return false; },
		unref: function (v) { return v; },
		readonly: function (v) { return v; },
		reactive: function (v) { return v; },
		computed: function (fn) {
			var val;
			var _dirty = true;
			var _computed = {};
			Object.defineProperty(_computed, 'value', {
				get: function () {
					if (_dirty) { val = fn(); _dirty = false; }
					return val;
				},
				enumerable: true,
				configurable: true
			});
			return _computed;
		},
		watch: function () { return noopVoid; },
		watchEffect: function () { return noopVoid; },
		magic_ref: noop,
		magic_shallowRef: noop,
		magic_isRef: function () { return false; },
		magic_unref: function (v) { return v; },
		magic_readonly: function (v) { return v; },
		magic_computed: function (fn) { return _exposedReactivity.computed(fn); },
		magic_watch: function () { return noopVoid; },
		magic_watchEffect: function () { return noopVoid; }
	};

	var _exposedErrorBoundary = {
		defineErrorBoundary: function (fn) { return fn; },
		magic_define_error_boundary: function (fn) { return fn; },
		wrapRender: function (scope, fn) { return fn; },
		onComponentError: noopVoid
	};

	var _exposedAsyncComponent = {
		defineAsyncComponent: function (opts) {
			return function () { return { fragment: document.createDocumentFragment(), interface: {} }; };
		},
		magic_define_async_component: function (opts) {
			return function () { return { fragment: document.createDocumentFragment(), interface: {} }; };
		}
	};

	var _exposedTeleport = {
		teleport: function () { return { mount: noopVoid, update: noopVoid, destroy: noopVoid }; },
		magic_teleport: function () { return { mount: noopVoid, update: noopVoid, destroy: noopVoid }; }
	};

	var _exposedTransition = {
		transition: function () { return { enter: function (d) { d && d(); }, leave: function (d) { d && d(); } }; },
		magic_transition: function () { return { enter: function (d) { d && d(); }, leave: function (d) { d && d(); } }; }
	};

	var _exposedPerf = window.__MAGIC_DEV__ ? {
		mark: noopVoid,
		measure: noop,
		startComponentRender: noopVoid,
		endComponentRender: noopVoid,
		getComponentRenderTime: function () { return null; },
		startRouteNavigation: noopVoid,
		endRouteNavigation: noopVoid,
		getRouteNavigationTime: function () { return null; },
		getPerfData: function () { return null; }
	} : null;

	// 延迟合并子模块 API 的工具函数(当子模块在 runtime.js 之后加载时调用)
	function _mergeSubModules() {
		// 检查是否有子模块挂载了真实实现
		var subMods = window.__MAGIC_SUB_MODULES__;
		if (!subMods) return;

		// Scheduler
		if (subMods.scheduler && magic.queueJob !== noopVoid) {
			// 子模块已覆盖
		}

		// Reactivity
		if (subMods.reactivity) {
			if (magic.ref === noop) Object.assign(magic, _exposedReactivity);
		}

		delete window.__MAGIC_SUB_MODULES__;
	}

	return {
		init,
		dom,
		importM,
		call,
		emit,
		$id,
		idGenerate,
		$,
		parserArgs,
		createArgs,
		parserListen,
		on_event,
		end_event,
		mapIdElement,
		createUiData,
		created,
		observeLifecycle,
		destroyEl,
		initComponentInterface,
		exportInterface,
		GetInterface,
		BindScope,
		DynamicValueBind,
		router,
		errorBoundary,
		wrapWithErrorBoundary,
		message: messageBus,
		onError: errorCollector.onError,
		lazyImport,
		loadChunk,
		// Stage A: 新 API(占位符,子模块加载后覆盖)
		queueJob: _exposedScheduler.queueJob,
		invalidateJob: _exposedScheduler.invalidateJob,
		flushQueue: _exposedScheduler.flushQueue,
		nextTick: _exposedScheduler.nextTick,
		magic_nextTick: _exposedScheduler.magic_nextTick,
		ref: _exposedReactivity.ref,
		shallowRef: _exposedReactivity.shallowRef,
		isRef: _exposedReactivity.isRef,
		unref: _exposedReactivity.unref,
		readonly: _exposedReactivity.readonly,
		reactive: _exposedReactivity.reactive,
		computed: _exposedReactivity.computed,
		watch: _exposedReactivity.watch,
		watchEffect: _exposedReactivity.watchEffect,
		magic_ref: _exposedReactivity.magic_ref,
		magic_shallowRef: _exposedReactivity.magic_shallowRef,
		magic_isRef: _exposedReactivity.magic_isRef,
		magic_unref: _exposedReactivity.magic_unref,
		magic_readonly: _exposedReactivity.magic_readonly,
		magic_computed: _exposedReactivity.magic_computed,
		magic_watch: _exposedReactivity.magic_watch,
		magic_watchEffect: _exposedReactivity.magic_watchEffect,
		defineErrorBoundary: _exposedErrorBoundary.defineErrorBoundary,
		magic_define_error_boundary: _exposedErrorBoundary.magic_define_error_boundary,
		wrapRender: _exposedErrorBoundary.wrapRender,
		onComponentError: _exposedErrorBoundary.onComponentError,
		defineAsyncComponent: _exposedAsyncComponent.defineAsyncComponent,
		magic_define_async_component: _exposedAsyncComponent.magic_define_async_component,
		teleport: _exposedTeleport.teleport,
		magic_teleport: _exposedTeleport.magic_teleport,
		transition: _exposedTransition.transition,
		magic_transition: _exposedTransition.magic_transition,
		perf: _exposedPerf
	};
})();