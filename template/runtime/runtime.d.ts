/**
 * 组件内置接口,由框架自动生成,提供可见性控制,刷新和销毁功能.
 * 通过 `call.component_interface` 或 `element.__magic_component_interface` 访问.
 *
 */
interface MagicComponentInterface {
	/**
	 * 切换组件可见性.
	 * 通过添加/移除 CSS class `m-visible-false` 实现.
	 * @param visible - `true` 显示,`false` 隐藏
	 */
	setVisible(visible: boolean): void;
	/**
	 * 重新渲染组件模板.
	 * 调用 `scope.__magic_template.render()` 重新构建 DOM.
	 */
	refresh(): void;
	/**
	 * 销毁组件:断开所有 observer → 调用 `destroy()` 生命周期 → 递归销毁子组件 → 从 DOM 中移除.
	 * 重复调用安全(通过 `__magic_disposed` 标记防护).
	 */
	dispose(): void;
}

/**
 * 组件生命周期事件.
 * 在 `.m` 文件的 `<script code="component-event">` 中定义.
 */
interface MagicComponentEvent {
	/**
	 * 组件创建后调用.适合初始化 timer,发起网络请求,注册事件监听.
	 * 由 `magic.created()` 触发.
	 */
	created?(): void;
	/**
	 * 组件销毁时调用.适合清理 timer,取消请求,断开连接.
	 * 由 `dispose()` 或 MutationObserver 检测 DOM 移除时自动触发.
	 */
	destroy?(): void;
	/**
	 * 组件可见性变化时调用.
	 * 基于 IntersectionObserver,适合暂停/恢复动画和轮询.
	 * @param visible - 当前是否可见
	 */
	visibleChange?(visible: boolean): void;
}

/**
 * `magic.call(scope)` 返回的 Proxy 调用器.
 * 通过代理模式安全访问组件的 interface / event / listen 等模块.
 *
 */
interface MagicCallProxy {
	/** 用户定义的接口方法代理 → `scope.__magic_interface` */
	interface: Record<string, (...args: unknown[]) => unknown>;
	/** 组件内置接口代理 → `scope.__magic_component_interface` */
	component_interface: MagicComponentInterface;
	/** DOM 事件处理函数代理 → `scope.__magic_event` */
	event: Record<string, (...args: unknown[]) => unknown>;
	/** 子组件事件监听函数代理 → `scope.__magic_listen_*` */
	listen: Record<string, (...args: unknown[]) => unknown>;
}

/**
 * DOM 操作工具集.
 * 编译器生成的代码中使用简写:`e()` / `t()` / `att()` / `eve()` / `a()`.
 */
interface MagicDom {
	/**
	 * 创建 DOM 元素,并标记 `__MAGIC_CREATE_ELEMENT__` 属性.
	 * @param tag - HTML 标签名
	 */
	element(tag: string): HTMLElement;
	/**
	 * 创建文本节点.
	 * @param content - 文本内容
	 */
	text(content: string): Text;
	/**
	 * 批量设置元素属性.`class` 属性自动按空格拆分后逐个添加.
	 * 如果元素是 fragment 包裹的,属性设置到第一个子元素上.
	 * @param e - 目标元素
	 * @param atts - 属性键值对
	 */
	attribute(e: HTMLElement, atts: Record<string, string>): void;
	/**
	 * 为元素绑定事件监听器.
	 * @param e - 目标元素
	 * @param eventName - 事件名称
	 * @param scope - 组件作用域(从中取 `__magic_event[fnName]`)
	 * @param fnName - `__magic_event` 上的函数名
	 * @param opt - addEventListener 的 options 参数
	 */
	event(e: HTMLElement, eventName: string, scope: MagicComponentScope, fnName: string, opt?: AddEventListenerOptions): void;
	/**
	 * 向父元素追加子元素.自动处理 fragment 展开和 inline 组件.
	 * @param parent - 父元素
	 * @param children - 要追加的子元素列表
	 */
	append(parent: MagicImportedElement, ...children: (MagicImportedElement | HTMLElement)[]): void;
}

/**
 * 事件发射器.
 * 用于组件向外暴露事件,父组件通过 `#listen:事件名` 监听.
 */
interface MagicEmit {
	/**
	 * 创建事件发射函数.
	 * @param listen - 父组件传入的监听对象
	 * @param exposeEvent - 当前组件通过 `<expose-event>` 声明的事件列表,用于校验
	 * @returns 发射函数,调用 `emit_event("事件名", ...参数)` 触发父组件回调
	 */
	event(listen: Record<string, (...args: unknown[]) => unknown>, exposeEvent?: Record<string, unknown>): (name: string, ...args: unknown[]) => unknown;
}

/**
 * ID-元素映射表.
 * 由 `magic.mapIdElement()` 创建,用于 `$id()` 快速查找.
 */
interface MagicMapIdElement {
	/**
	 * 注册元素并关联 ID.
	 * @param id - 元素 ID(对应 `#id` 属性值)
	 * @param e - 元素
	 * @param cssScope - 可选的 CSS 作用域类名,自动添加到元素上
	 */
	s(id: string, e: HTMLElement, cssScope?: string): void;
	/** 通过 ID 获取注册的元素 */
	get(id: string): HTMLElement | undefined;
	/** 注册元素(同 `s()`) */
	set(id: string, e: HTMLElement): void;
	/** 遍历所有已注册的元素 */
	forEach(fn: (element: HTMLElement, id: string) => void): void;
	/** 已注册的元素数量 */
	readonly size: number;
}

/**
 * `$id()` 返回的单个元素上挂载的 `$name()` 查找器.
 * 非递归搜索子元素中 `_$name` 匹配的元素.
 */
interface Magic$IdResult {
	/**
	 * 通过 `#name` 属性值查找子元素.
	 * 搜索范围限定在当前组件内部(遇到有 `_$id` 的子组件时停止深入).
	 * @param name - 元素的 `#name` 值
	 * @returns 匹配的元素,未找到返回 null
	 */
	$name(name: string): HTMLElement | null;
}

/**
 * `$id()` 无参调用时的返回值 ---- 所有已注册元素的映射对象.
 * key 格式为 `$$驼峰形式`,如 `$myButton`.
 */
type MagicIdElementMap = Record<string, HTMLElement & Magic$IdResult>;

/**
 * 路由匹配结果.
 */
interface MagicRouterRoute {
	/** 路由路径模式,如 `/user/:id` */
	path: string;
	/** 对应的组件名 */
	component: string;
	/** 路径参数,如 `{ id: "123" }` */
	params?: Record<string, string>;
	/** 查询参数 */
	query?: Record<string, string>;
}

/**
 * 客户端路由系统.
 * 支持 history 和 hash 两种模式,提供导航守卫和路由切换时的自动 dispose.
 */
interface MagicRouter {
	/** 获取当前匹配的路由信息 */
	getCurrentRoute(): MagicRouterRoute | null;
	/**
	 * 添加单条路由规则.
	 * @param path - 路径模式,支持 `:param` 动态参数
	 * @param component - 对应的组件名
	 */
	addRoute(path: string, component: string): void;
	/**
	 * 批量添加路由规则.
	 * @param routeList - `{ path, component }` 数组
	 */
	addRoutes(routeList: { path: string; component: string }[]): void;
	/**
	 * 初始化路由,挂载到指定容器元素.
	 * 自动监听 URL 变化并渲染对应组件.
	 * @param containerId - 容器元素的 id
	 * @param options - `mode` 可选 `"history"`(默认)或 `"hash"`
	 */
	init(containerId: string, options?: { mode?: "history" | "hash" }): void;
	/**
	 * 导航到指定路径(底层方法,包含守卫校验和容错).
	 * @param path - 目标路径
	 * @param replace - 是否替换当前历史记录
	 */
	navigate(path: string, replace?: boolean): void;
	/**
	 * 推入新路由(新增历史记录),等同于 `router.push()`.
	 * @param path - 目标路径
	 */
	push(path: string): void;
	/**
	 * 替换当前路由(不新增历史记录).
	 * @param path - 目标路径
	 */
	replace(path: string): void;
	/** 返回上一页 */
	back(): void;
	/** 前进到下一页 */
	forward(): void;
	/** 跳转到历史记录中的指定位置 */
	go(n: number): void;
	/**
	 * 注册全局前置守卫.
	 * 返回 `false` 取消导航,返回字符串则重定向到该路径.
	 * @param guard - 守卫函数,支持 async
	 */
	beforeEach(guard: (to: MagicRouterRoute, from: MagicRouterRoute | null) => boolean | string | Promise<boolean | string>): void;
	/**
	 * 注册全局后置钩子.
	 * 在路由渲染完成后调用.
	 * @param hook - 回调函数
	 */
	afterEach(hook: (to: MagicRouterRoute, from: MagicRouterRoute | null) => void): void;
}

/**
 * 全局错误收集器(内部使用).
 * DOM 就绪前积压错误,就绪后使用 HTML5 `<dialog>` 元素渲染模态错误面板.
 * 对话框不可关闭(无关闭按钮,ESC 键被阻止),用户只能通过"刷新页面"按钮重新加载.
 */
interface MagicErrorCollector {
	/**
	 * 向错误收集器推送一个错误.
	 * @param err - 错误对象
	 */
	push(err: Error): void;
}

/**
 * 组件作用域内部属性.
 * 由编译器生成的代码注入,运行时框架使用.
 */
interface MagicScopeInternal {
	/** 用户定义的 DOM 事件处理函数映射 */
	__magic_event: Record<string, (...args: unknown[]) => unknown>;
	/** 生命周期事件对象 */
	__magic_component_event: MagicComponentEvent;
	/** 组件内置接口(setVisible / refresh / dispose) */
	__magic_component_interface: MagicComponentInterface;
	/** 用户定义的接口方法映射 */
	__magic_interface: Record<string, (...args: unknown[]) => unknown>;
	/** 生命周期 observer 引用列表,dispose 时统一断开 */
	__magic_lifecycle_observers: { disconnect(): void }[] | null;
	/** 组件是否已销毁标记 */
	__magic_disposed: boolean;
	/** 模板操作对象(由编译器在生成代码中赋值) */
	__magic_template: {
		/** 执行 DOM 构建 */
		render(): void;
		/** 绑定所有事件监听器 */
		bind_event(): void;
		/** 导出模板根元素数组 */
		export_element(): HTMLElement[];
	};
	/** 组件 DOM 片段根节点 */
	__magic_element_root: DocumentFragment;
}

/**
 * 组件作用域类型(等同于 MagicScopeInternal).
 */
type MagicComponentScope = MagicScopeInternal;

/**
 * Magic 组件实例元素.
 * 通过 `magic.importM()` 创建,或由编译器生成的模块工厂函数返回.
 *
 * 继承标准 HTMLElement,并扩展了大量框架专用属性.
 */
interface MagicImportedElement extends HTMLElement {
	/** 源文件路径 */
	__file: string;
	/** 模块唯一 ID(对应 `m-id-xxx`) */
	mid: string;
	/** 组件 DOM 片段 */
	fragment: DocumentFragment;
	/** 用户接口方法代理 */
	interface: Record<string, (...args: unknown[]) => unknown>;
	/** 组件内置接口 */
	__magic_component_interface: MagicComponentInterface;
	/** 生命周期事件对象 */
	__magic_component_event: MagicComponentEvent;
	/** 模板参数标记 */
	templateArgs: { inline: boolean };
	/** 暴露的事件声明 */
	exposeEvent: Record<string, unknown>;
	/** 绑定的组件作用域(只读) */
	__SCOPE__: MagicComponentScope;
	/** 当前元素是否被 fragment 包裹 */
	__fragment?: boolean;
	/** 是否已被标记销毁 */
	__magic_disposed?: boolean;
	/** 生命周期 observer 列表 */
	__lifecycle_observers?: { disconnect(): void }[] | null;
	/** 生命周期延迟 timer 引用 */
	__lifecycle_timer?: ReturnType<typeof setTimeout>;
	/** 模块 ID 标记(由 BindScope 设置) */
	__MAGIC_MODULE_ID?: string;
	/** 元素的 #id 属性值 */
	_$id?: string;
	/** 元素的 #name 属性值 */
	_$name?: string;
}

/**
 * 组件构造函数.
 * 存储在 `window.__MAGIC__.M` 中.
 * @param args - 传递给模块的参数对象
 * @param listen - 事件监听对象
 * @returns 组件实例元素
 */
type MagicComponentConstructor = new (args?: Record<string, unknown>, listen?: Record<string, (...args: unknown[]) => unknown>) => MagicImportedElement;

/**
 * 响应式 UI 数据对象.
 * 由 `magic.createUiData()` 创建,基于 Proxy 实现深层响应式.
 *
 * 属性赋值时自动通知绑定的文本节点更新.
 */
interface MagicUiData {
	/**
	 * 绑定动态值到文本节点.
	 * @param bindingMap - `{ 属性路径: [文本节点数组] }` 映射
	 * @returns 返回自身,支持链式调用
	 */
	__DynamicValueBind(bindingMap: Record<string, Text[]>): MagicUiData;
	/**
	 * 通过点号分隔的路径获取嵌套属性值.
	 * @param path - 属性路径,如 `"user.profile.name"`
	 */
	_getValueByPath(path: string): unknown;
	/** 动态属性 */
	[key: string]: unknown;
}

/**
 * Magic 运行时核心 API.
 * 挂载在 `window.magic` 上,提供 DOM 操作,模块加载,事件处理,生命周期管理等全部运行时功能.
 */
interface Magic {
	/**
	 * 框架初始化入口.
	 * 加载入口组件并渲染到 `#app` 容器.
	 * @param main - 入口组件名(不含 .m 扩展名)
	 */
	init(main: string): void;
	/** DOM 操作工具集 */
	dom: MagicDom;
	/**
	 * 导入并实例化模块.
	 * 模块名自动去除非字母字符并转为小写后从 `window.__MAGIC__.M` 查找.
	 *
	 * @param name - 模块名(对应编译后的组件名)
	 * @param args - 传递给模块的参数
	 * @param listen - 事件监听对象
	 * @returns 组件实例元素
	 *
	 */
	importM(name: string, args?: Record<string, unknown>, listen?: Record<string, (...args: unknown[]) => unknown>): MagicImportedElement;
	/**
	 * 创建作用域 Proxy 调用器.
	 * 通过代理模式访问组件的 interface / event / listen.
	 *
	 * @param scope - 组件作用域
	 * @returns Proxy 调用器
	 *
	 */
	call(scope: MagicComponentScope): MagicCallProxy;
	/** 事件发射器 */
	emit: MagicEmit;
	/**
	 * 创建 ID 元素查找器.
	 *
	 * @param map - `magic.mapIdElement()` 创建的映射表
	 * @returns 可调用对象:无参时返回全部元素映射,传入 id 时返回单个元素
	 *
	 */
	$id(map: MagicMapIdElement): {
		(): MagicIdElementMap;
		(id: string): HTMLElement & Magic$IdResult;
	};
	/**
	 * 生成唯一模块 ID.
	 * 格式为 `"m-id-" + 时间戳36进制 + 随机字母`.
	 */
	idGenerate(): string;
	/**
	 * 全局 DOM 查询.
	 * 优先命中 midCache(O(1)),未命中则 DFS 遍历(O(n)).
	 *
	 * @param id - 模块 ID(mid 值)
	 * @param root - 搜索根元素,默认 `document.body`
	 * @returns 匹配的元素,未找到返回 null
	 */
	$(id: string, root?: HTMLElement): MagicImportedElement | null;
	/**
	 * 解析参数对象.
	 * - 如果是 JSON 字符串,解析为对象(最大 100KB)
	 * - 如果是对象,深拷贝并展开冒号分隔的嵌套键(如 `"user:name"` → `{ user: { name } }`)
	 * - 过滤 `__proto__` / `constructor` / `prototype` 污染键
	 *
	 * @param args - JSON 字符串或参数对象
	 * @returns 解析后的纯净对象
	 */
	parserArgs(args: string | Record<string, unknown>): Record<string, unknown>;
	/**
	 * 将对象序列化为 JSON 字符串.
	 * @param obj - 要序列化的对象
	 */
	createArgs(obj: Record<string, unknown>): string;
	/**
	 * 安全获取 listen 对象,null/undefined 时返回 `{}`.
	 * @param listen - 监听对象
	 */
	parserListen(listen?: Record<string, (...args: unknown[]) => unknown>): Record<string, (...args: unknown[]) => unknown>;
	/**
	 * 触发事件处理(开始阶段).
	 * 使用 WeakMap 存储运行状态,不污染原生 Event 对象.
	 *
	 * @param event - 原生 DOM 事件
	 * @param listen - 监听函数映射
	 */
	on_event(event: Event, listen: Record<string, (event: Event) => unknown>): unknown;
	/**
	 * 触发事件处理(结束阶段).
	 * @param event - 原生 DOM 事件
	 * @param listen - 监听函数映射
	 */
	end_event(event: Event, listen: Record<string, (event: Event) => unknown>): unknown;
	/**
	 * 创建 ID-元素映射表.
	 * 供 `$id()` 使用.
	 */
	mapIdElement(): MagicMapIdElement;
	/**
	 * 创建响应式 UI 数据对象.
	 * 合并 target(默认值)和 source(传入值),自动进行类型转换,返回 Proxy 代理.
	 *
	 * 类型转换规则:
	 * - `"true"`/`"false"` → Boolean
	 * - `"42"`/`"3.14"` → Number
	 * - `"[1,2]"` → Array
	 * - `"/^abc/g"` → RegExp
	 *
	 * @param target - 默认值对象
	 * @param source - 传入值对象(通常为字符串)
	 * @returns 响应式 Proxy 对象
	 *
	 */
	createUiData(target?: Record<string, unknown>, source?: Record<string, unknown>): MagicUiData;
	/**
	 * 批量触发组件的 `created` 生命周期.
	 * 同时在下一个事件循环中递归处理子组件,设置 `observeLifecycle`.
	 *
	 * @param elements - 组件实例元素列表
	 *
	 */
	created(...elements: MagicImportedElement[]): void;
	/**
	 * 设置生命周期观察器.
	 * - destroy:MutationObserver 监听 DOM 移除 → 自动触发 `destroy()`
	 * - visibleChange:IntersectionObserver 监听可见性变化
	 *
	 * @param el - 组件实例元素
	 */
	observeLifecycle(el: MagicImportedElement): void;
	/**
	 * 断开所有 lifecycle observers 和 timers.
	 * 不调用 `destroy()` 生命周期,仅做资源清理.
	 * @param el - 组件实例元素
	 */
	destroyEl(el: MagicImportedElement): void;
	/**
	 * 初始化组件内置接口.
	 * 在 `scope` 上创建 `setVisible` / `refresh` / `dispose` 方法.
	 * 由编译器生成代码自动调用,替代内联重复代码.
	 *
	 * @param scope - 组件作用域
	 */
	initComponentInterface(scope: MagicComponentScope): void;
	/**
	 * 导出接口映射.
	 * 将子组件的接口方法代理到父组件作用域上,支持参数转换.
	 *
	 * @param scope - 父组件作用域
	 * @param target - 子组件实例
	 * @param parcel - 接口映射:key 为目标方法名,value 为转换函数(null 表示直接透传)
	 */
	exportInterface(scope: MagicComponentScope, target: MagicImportedElement, parcel: Record<string, ((...args: unknown[]) => unknown) | null>): void;
	/**
	 * 获取元素绑定的作用域接口.
	 * @param ele - 元素
	 * @returns 用户接口对象,未绑定则返回 null
	 */
	GetInterface(ele: MagicImportedElement): Record<string, (...args: unknown[]) => unknown> | null;
	/**
	 * 为元素数组绑定作用域和模块 ID.
	 * `__SCOPE__` 设置为只读(Object.defineProperty),并注册到 midCache.
	 *
	 * @param arr - 元素数组(空数组会被填充为 `[{}]`)
	 * @param scope - 组件作用域
	 * @param id - 模块 ID
	 * @returns 绑定后的元素数组
	 */
	BindScope(arr: HTMLElement[], scope: MagicComponentScope, id?: string): HTMLElement[];
	/**
	 * 动态值绑定.
	 * 将文本节点关联到 UiData,属性变化时自动更新.
	 *
	 * @param args - 前面 N 个是包含 `${}` 的文本节点所在元素,最后一个元素必须是 `MagicUiData`
	 *
	 */
	DynamicValueBind(...args: [...HTMLElement[], MagicUiData]): void;
	/** 客户端路由系统 */
	router: MagicRouter;
	/**
 * 错误边界包装器.
 * 捕获函数执行时的异常,推入 `errorCollector`,可选渲染 fallback UI.
 *
 * @param fn - 要包装的函数
 * @param fallbackUI - 发生错误时的降级渲染函数
 * @returns 包装后的函数(保持原签名)
 */
errorBoundary<T extends (...args: unknown[]) => unknown>(fn: T, fallbackUI?: (error: Error) => unknown): T;
/**
 * 为特定作用域包装函数错误边界.
 * 与 `errorBoundary` 不同,此方法会在捕获错误时附加组件名称上下文.
 *
 * @param scope - 组件作用域(作为函数的 this)
 * @param fn - 要包装的函数
 * @param componentName - 组件名称(用于错误上下文)
 * @returns 包装后的函数
 */
wrapWithErrorBoundary(scope: MagicComponentScope, fn: (...args: unknown[]) => unknown, componentName?: string): (...args: unknown[]) => unknown;
/**
 * 注册自定义错误处理函数.
 * 所有未捕获错误和未处理 Promise 拒绝都会先经过已注册的处理函数.
 * 处理函数返回 `false` 时,错误将不会弹出错误对话框.
 *
 * @param handler - 错误处理函数,接收 Error 对象,返回 `true` 弹出对话框,返回 `false` 静默忽略
 *
 */
onError(handler: (err: Error) => boolean): void;
/**
 * 懒加载模块(代码分割 / dynamic import).
 * 异步加载指定 chunk 的 JS 和 CSS 文件,加载完成后从 `window.__MAGIC__.M` 获取模块构造函数.
 *
 * 支持去重请求:同一 chunk 的多次调用只会触发一次网络请求.
 *
 * @param moduleName - chunk 名称(对应编译输出的 chunk 文件名,不含扩展名)
 * @returns Promise,resolve 为模块构造函数(MagicComponentConstructor)
 *
 */
lazyImport(moduleName: string): Promise<MagicComponentConstructor>;
/**
 * 加载代码分割 chunk(JS + CSS).
 * 动态创建 `<script>` 和 `<link>` 标签,从 `./magic/` 目录加载 chunk 文件.
 * 多次调用同一 chunk 会合并为一个请求,所有等待者共享同一个 Promise.
 *
 * @param chunkName - chunk 文件名(不含扩展名),对应编译输出目录下的 `{chunkName}.js` 和 `{chunkName}.css`
 * @returns Promise,resolve 表示加载完成
 *
 */
loadChunk(chunkName: string): Promise<void>;

	// ========== Stage A: 新增 API ==========

	// ---- Scheduler ----
	/**
	 * 将 watcher job 加入批处理队列(自动去重).
	 * 同一同步块内的多次更新只 flush 一次.
	 * @param job - 待执行的函数,需有 `_uid` 属性用于去重
	 */
	queueJob(job: { (): void; _uid: number }): void;
	/**
	 * 从队列中移除 job(组件卸载时调用).
	 * @param job - 之前加入队列的函数
	 */
	invalidateJob(job: { (): void; _uid: number }): void;
	/** 立即执行队列中所有 pending jobs */
	flushQueue(): void;
	/**
	 * 在下次 flush 后执行回调.
	 * @param fn - 可选回调函数
	 * @returns Promise(如果 fn 为 undefined)
	 */
	nextTick<T = void>(fn?: (() => T | PromiseLike<T>) | undefined): Promise<T> | undefined;

	// ---- Reactivity ----
	/**
	 * 创建响应式引用,深层代理 .value.
	 * @param value - 初始值
	 * @returns Ref 对象
	 *
	 */
	ref<T>(value: T): MagicRef<T>;
	/** 别名:同 ref() */
	magic_ref<T>(value: T): MagicRef<T>;
	/**
	 * 创建浅层响应式引用,不深度代理 .value.
	 * @param value - 初始值
	 */
	shallowRef<T>(value: T): MagicRef<T>;
	/** 别名:同 shallowRef() */
	magic_shallowRef<T>(value: T): MagicRef<T>;
	/** 检查值是否为 ref */
	isRef(v: unknown): v is MagicRef<unknown>;
	/** 别名:同 isRef() */
	magic_isRef(v: unknown): v is MagicRef<unknown>;
	/** 解包 ref:如果是 ref 返回 .value,否则返回原值 */
	unref<T>(v: MagicRef<T> | T): T;
	/** 别名:同 unref() */
	magic_unref<T>(v: MagicRef<T> | T): T;
	/**
	 * 创建深层只读代理.
	 * @param obj - 目标对象
	 *
	 */
	readonly<T extends object>(obj: T): MagicReadonly<T>;
	/** 别名:同 readonly() */
	magic_readonly<T extends object>(obj: T): MagicReadonly<T>;
	/**
	 * 创建深层响应式 Proxy.
	 * @param obj - 目标对象
	 *
	 */
	reactive<T extends object>(obj: T): T;
	/**
	 * 创建计算属性(惰性求值 + 自动缓存).
	 * @param getter - 计算函数
	 *
	 */
	computed<T>(getter: () => T): MagicComputed<T>;
	/** 别名:同 computed() */
	magic_computed<T>(getter: () => T): MagicComputed<T>;
	/**
	 * 监视数据源变化,支持 immediate / deep 选项.
	 * @param source - 数据源:函数,ref,或 reactive 对象
	 * @param callback - 变化回调 (newVal, oldVal, onCleanup)
	 * @param options - { immediate?, deep? }
	 * @returns stop 函数
	 *
	 */
	watch<T>(
		source: (() => T) | MagicRef<T> | object,
		callback: (newVal: T, oldVal: T | undefined, onCleanup: (fn: () => void) => void) => void,
		options?: MagicWatchOptions
	): () => void;
	/** 别名:同 watch() */
	magic_watch<T>(
		source: (() => T) | MagicRef<T> | object,
		callback: (newVal: T, oldVal: T | undefined, onCleanup: (fn: () => void) => void) => void,
		options?: MagicWatchOptions
	): () => void;
	/**
	 * 自动收集依赖的副作用函数.
	 * @param fn - 副作用函数
	 * @returns stop 函数
	 */
	watchEffect(fn: () => void): () => void;
	/** 别名:同 watchEffect() */
	magic_watchEffect(fn: () => void): () => void;

	// ---- Error Boundary ----
	/**
	 * 包装组件渲染函数,捕获同步错误并显示 fallback UI.
	 * @param fn - 组件渲染函数
	 * @param options - { componentName?, onError?, showFallback? }
	 */
	defineErrorBoundary<T extends (...args: unknown[]) => unknown>(
		fn: T,
		options?: MagicErrorBoundaryOptions
	): T;
	/** 别名:同 defineErrorBoundary() */
	magic_define_error_boundary<T extends (...args: unknown[]) => unknown>(
		fn: T,
		options?: MagicErrorBoundaryOptions
	): T;
	/**
	 * 包装组件 scope 上的 render 函数.
	 * @param scope - 组件作用域
	 * @param renderFn - 渲染函数
	 * @param componentName - 组件名称
	 */
	wrapRender(scope: MagicComponentScope, renderFn: (...args: unknown[]) => unknown, componentName?: string): (...args: unknown[]) => unknown;
	/**
	 * 注册全局 onError 回调(带组件上下文).
	 * @param handler - (error, componentName) => boolean
	 */
	onComponentError(handler: (err: Error, componentName?: string) => boolean): void;

	// ---- Async Component ----
	/**
	 * 定义异步组件.
	 * @param options - { loader, loadingComponent?, errorComponent?, delay?, timeout? }
	 * @returns 组件构造函数
	 */
	defineAsyncComponent(options: MagicAsyncComponentOptions): MagicComponentConstructor;
	/** 别名:同 defineAsyncComponent() */
	magic_define_async_component(options: MagicAsyncComponentOptions): MagicComponentConstructor;

	// ---- Teleport ----
	/**
	 * 将元素传送到指定 DOM 节点.
	 * @param selector - 目标容器的 CSS 选择器
	 * @param element - 要传送的元素
	 * @param options - { position? }
	 * @returns { mount, update, destroy }
	 */
	teleport(selector: string, element: HTMLElement | MagicImportedElement, options?: MagicTeleportOptions): MagicTeleportResult;
	/** 别名:同 teleport() */
	magic_teleport(selector: string, element: HTMLElement | MagicImportedElement, options?: MagicTeleportOptions): MagicTeleportResult;

	// ---- Transition ----
	/**
	 * CSS transition 封装,自动添加/移除 CSS class.
	 * @param element - 目标元素
	 * @param options - { name?, duration?, onBeforeEnter?, onEnter?, ... }
	 * @returns { enter, leave }
	 */
	transition(element: HTMLElement, options?: MagicTransitionOptions): MagicTransitionResult;
	/** 别名:同 transition() */
	magic_transition(element: HTMLElement, options?: MagicTransitionOptions): MagicTransitionResult;

	// ---- Performance ----
	/** 性能监控工具集(dev 模式可用,prod 返回 no-op/null) */
	perf: MagicPerf | null;
	/**
	 * 组件间消息总线.
	 *
	 * 允许组件之间通过消息类型进行解耦通信.
	 * 监听绑定到 HTMLElement 的生命周期,元素从 DOM 移除时自动注销监听.
	 *
	 * @example
	 * // 组件 A — 注册监听
	 * magic.message.on($myElement, "data-update", (data) => {
	 *     console.log("收到数据:", data);
	 * });
	 *
	 * // 组件 B — 发送消息
	 * magic.message.emit("data-update", { hello: "world" });
	 */
	message: MagicMessageBus;
}

/**
 * 响应式引用对象 (Ref).
 */
interface MagicRef<T = unknown> {
	/** 响应式值:读取时收集依赖,赋值时触发更新 */
	value: T;
	/** 内部标记(只读) */
	readonly __m_isRef: true;
}

/**
 * 计算属性对象.
 */
interface MagicComputed<T = unknown> {
	/** 只读计算值:惰性求值 + 自动缓存 */
	readonly value: T;
	/** 内部标记 */
	readonly __m_isRef: true;
	readonly __m_isComputed: true;
}

/**
 * 只读代理类型.
 */
type MagicReadonly<T> = {
	readonly [P in keyof T]: T[P] extends object ? MagicReadonly<T[P]> : T[P];
};

/**
 * watch() 的选项.
 */
interface MagicWatchOptions {
	/** 是否立即执行一次 */
	immediate?: boolean;
	/** 是否深度监听(遍历所有嵌套属性) */
	deep?: boolean;
}

/**
 * defineErrorBoundary() 的选项.
 */
interface MagicErrorBoundaryOptions {
	/** 组件名称(用于错误上下文) */
	componentName?: string;
	/** 自定义错误回调 */
	onError?: (error: Error, componentName: string) => void;
	/** 是否显示 fallback UI(默认 true) */
	showFallback?: boolean;
}

/**
 * defineAsyncComponent() 的选项.
 */
interface MagicAsyncComponentOptions {
	/** 异步加载函数,返回 Promise<组件构造函数> */
	loader: () => Promise<MagicComponentConstructor>;
	/** 加载中显示的组件/配置 */
	loadingComponent?: MagicComponentConstructor | { render(): HTMLElement } | HTMLElement;
	/** 加载失败显示的组件/配置 */
	errorComponent?: MagicComponentConstructor | { render(args: { error: Error }): HTMLElement } | HTMLElement;
	/** 显示 loading 前的延迟(ms,默认 200) */
	delay?: number;
	/** 超时时间(ms,0 表示不超时) */
	timeout?: number;
}

/**
 * teleport() 的选项.
 */
interface MagicTeleportOptions {
	/** 插入位置:'append' | 'prepend' | 'before' | 'after'(默认 'append') */
	position?: 'append' | 'prepend' | 'before' | 'after';
}

/**
 * teleport() 的返回值.
 */
interface MagicTeleportResult {
	/** 手动挂载 */
	mount(): void;
	/** 切换目标容器 */
	update(selector: string, options?: MagicTeleportOptions): void;
	/** 销毁(元素移回原位置) */
	destroy(): void;
}

/**
 * transition() 的选项.
 */
interface MagicTransitionOptions {
	/** CSS class 前缀(默认 'm') */
	name?: string;
	/** 动画时长(ms),不传则自动从 CSS 获取 */
	duration?: number;
	/** 进入动画开始前 */
	onBeforeEnter?(el: HTMLElement): void;
	/** 进入动画执行中 */
	onEnter?(el: HTMLElement, done: () => void): void;
	/** 进入动画结束后 */
	onAfterEnter?(el: HTMLElement): void;
	/** 离开动画开始前 */
	onBeforeLeave?(el: HTMLElement): void;
	/** 离开动画执行中 */
	onLeave?(el: HTMLElement, done: () => void): void;
	/** 离开动画结束后 */
	onAfterLeave?(el: HTMLElement): void;
}

/**
 * transition() 的返回值.
 */
interface MagicTransitionResult {
	/** 执行进入动画 */
	enter(done?: () => void): void;
	/** 执行离开动画 */
	leave(done?: () => void): void;
}

/**
 * 性能监控工具集.
 */
interface MagicPerf {
	/** 记录性能标记 */
	mark(name: string): void;
	/** 测量两个标记之间的耗时 */
	measure(name: string, startMark: string, endMark: string): number | undefined;
	/** 记录组件渲染开始 */
	startComponentRender(componentName: string): void;
	/** 记录组件渲染结束 */
	endComponentRender(componentName: string): void;
	/**
	 * 获取组件渲染耗时统计.
	 * @returns { count, totalTime, lastTime, avgTime }
	 */
	getComponentRenderTime(componentName: string): { count: number; totalTime: number; lastTime: number; avgTime: number } | null;
	/** 记录路由导航开始 */
	startRouteNavigation(): void;
	/** 记录路由导航结束 */
	endRouteNavigation(): void;
	/**
	 * 获取路由切换耗时.
	 * @returns { count, lastTime }
	 */
	getRouteNavigationTime(): { count: number; lastTime: number } | null;
	/** 获取所有性能数据(调试用) */
	getPerfData(): { componentTimings: Record<string, { count: number; totalTime: number; lastTime: number }>; routeTimings: { count: number; lastTime: number } } | null;
}

/**
 * 组件间消息总线接口.
 *
 * 提供基于 DOM 元素生命周期的发布-订阅机制.
 * 监听绑定到 HTMLElement 上,当元素从 DOM 树移除时,监听器自动清理.
 * 同一消息类型可被多个不同元素监听,互不干扰.
 */
interface MagicMessageBus {
	/**
	 * 注册消息监听.
	 *
	 * @param element - 绑定的 HTML 元素.该元素从 DOM 移除时,监听器自动注销.
	 * @param messageType - 消息类型名称.
	 * @param callback - 消息回调函数,接收 `emit` 发送的数据.
	 * @param autoOff - 可选,设为 `true` 时触发一次后自动注销监听.
	 * @returns 取消监听的函数,调用后手动移除该监听.
	 *
	 * @example
	 * const unsubscribe = magic.message.on($el, "user-login", (user) => {
	 *     console.log("用户登录:", user.name);
	 * });
	 * // 手动取消
	 * unsubscribe();
	 *
	 * @example
	 * // 触发一次后自动注销
	 * magic.message.on($el, "once-event", (data) => {
	 *     console.log("只触发一次:", data);
	 * }, true);
	 */
	on(element: HTMLElement, messageType: string, callback: (data: unknown) => void, autoOff?: boolean): () => void;

	/**
	 * 手动取消消息监听.
	 *
	 * @param element - 绑定的 HTML 元素(必须与注册时是同一引用).
	 * @param messageType - 消息类型名称.
	 *
	 * @example
	 * magic.message.off($el, "user-login");
	 */
	off(element: HTMLElement, messageType: string): void;

	/**
	 * 发送消息到所有监听者.
	 *
	 * @param messageType - 消息类型名称.
	 * @param data - 消息数据(任意 JSON 可序列化值),所有监听该类型的回调都会收到.
	 *
	 * @example
	 * magic.message.emit("user-login", { name: "Alice", id: 1 });
	 */
	emit(messageType: string, data: unknown): void;
}

/**
 * 框架内部全局存储.
 * 挂载在 `window.__MAGIC__`.
 */
interface MagicInternal {
	/**
	 * 模块注册表.
	 * key 为模块名(去除非字母字符后小写),value 为组件构造函数.
	 */
	M: Record<string, MagicComponentConstructor>;
	/**
	 * 元素创建列表(内部使用,用于跟踪框架创建的元素).
	 */
	CREATE_ELEMENT_LIST: Map<unknown, unknown>;
}

/**
 * Window 全局扩展.
 * Magic 框架运行时向 window 注入以下属性.
 */
interface Window {
	/**
	 * Magic 运行时核心 API.
	 * 在所有 runtime 脚本加载完成后可用,`init()` 调用前被 `Object.freeze()` 冻结.
	 */
	magic: Magic;
	/**
	 * Magic 框架版本号(从 package.json 读取).
	 * `init()` 调用时被 `Object.freeze()` 冻结.
	 */
	magic_version: string;
	/**
	 * 框架内部全局存储(模块注册表等).
	 * 由编译器生成的模块代码向 `__MAGIC__.M` 注册组件.
	 */
	__MAGIC__: MagicInternal;
}
