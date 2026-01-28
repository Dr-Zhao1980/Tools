// ==UserScript==
// @name         12306抢票：drzhao高速稳定版
// @namespace    https://github.com/Dr-Zhao1980/Tools/blob/main/%E6%B2%B9%E7%8C%B4%E8%84%9A%E6%9C%AC/12306%E6%8A%A2%E7%A5%A8.user.js
// @version      1.6
// @description  激进版：这个脚本可以比较激进的实现抢票，12306端没有发回信号就开始抢票了
// @author       Dr_Zhao
// @match        https://kyfw.12306.cn/otn/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    console.log('>>> 12306 抢票助手 Pro 已加载 <<<');

    // ==========================================
    // 0. Configuration (配置)
    // ==========================================
    /**
     * 全局配置对象
     * 说明：
     * - 所有可调参数集中在这里，方便统一管理和调试
     * - 修改这些配置时，请结合注释理解对应含义，避免影响抢票逻辑稳定性
     */
    const CONFIG = {

        //=====================================================================所有的相关URL===========================================================
        URL: {
            /** 12306 网站基础域名（目前用于构造完整请求地址） */
            BASE: 'https://kyfw.12306.cn',
            /**
             * 站点简码 JS 文件地址
             * 用于获取站点中文名与站点代码（如 上海 -> SHH）的映射
             */
            STATION_MAP: 'https://kyfw.12306.cn/otn/resources/js/framework/station_name.js',
            /**
             * 左侧余票查询初始化页
             * - 用于：时间同步（HEAD 请求获取服务器时间）
             * - 也可作为页面来源 / Referer 校验的基础地址
             */
            LEFT_TICKET_INIT: 'https://kyfw.12306.cn/otn/leftTicket/init'
        },
        //=====================================================================所有的相关URL===========================================================





        //=====================================================================所有的网络请求===========================================================

        NETWORK: {
            /**
             * 余票查询接口（相对路径）
             * 示例：/otn/leftTicket/query?leftTicketDTO.train_date=...
             */
            QUERY_URL: '/otn/leftTicket/query',
            /**
             * 请求头 Referer
             * - 有些接口需要正确的 Referer 才能通过校验
             * - 一般保持与实际浏览页面一致即可
             */
            REFERER: 'https://kyfw.12306.cn/otn/leftTicket/init',
            /** 请求头 Origin */
            ORIGIN: 'https://kyfw.12306.cn',
            /** 请求头 Host */
            HOST: 'kyfw.12306.cn',
            FETCH_KEEPALIVE: true,
            FETCH_PRIORITY: 'high'
        },

        //=====================================================================所有的网络请求===========================================================



        //=====================================================================所有的缓存===========================================================
        CACHE: {
            /**
             * 本地缓存使用的 key
             * - 存储：用户上次填写的设置，如出发站、到达站、乘客、座位偏好等
             * - 位置：window.localStorage[KEY]
             */
            KEY: 'ticket_helper_cache',
            /**
             * 从缓存恢复乘客信息时的延迟（毫秒）
             * - 目的：等页面中 12306 自身的乘客列表渲染完成，再应用我们的勾选状态
             * - 若发现恢复失败，可适当加大此时间（如 1000ms~2000ms）
             */
            RESTORE_PASSENGERS_DELAY_MS: 500
        },

        //=====================================================================所有的缓存===========================================================



        //=====================================================================所有的默认值===========================================================
        DEFAULTS: {
            /** 默认出发站（中文名，仅作为 UI 初始值，非强制） */
            FROM_STATION_NAME: '上海',
            /** 默认到达站（中文名，仅作为 UI 初始值，非强制） */
            TO_STATION_NAME: '杭州',
            /**
             * 默认优先座位类型（文本形式，逗号分隔）
             * 实际逻辑中会按顺序优先尝试这些席别
             */
            SEAT_TYPES_TEXT: '硬卧,硬座,无座,二等座,一等座',
            /** 出发站输入框的占位提示文案 */
            FROM_STATION_PLACEHOLDER: '如 上海',
            /** 到达站输入框的占位提示文案 */
            TO_STATION_PLACEHOLDER: '如 杭州',
            /** 车次输入框的占位提示文案（英文逗号分隔多个车次） */
            TRAIN_CODES_PLACEHOLDER: '如 G123,G456'
        },

        //=====================================================================所有的默认值===========================================================



        //=====================================================================所有的UI===========================================================
        UI: {
            /**
             * 浮动控制面板距离页面顶部的像素
             * - 数值越大，面板越靠下
             */
            PANEL_TOP_PX: 50,
            /**
             * 浮动控制面板距离页面右侧的像素
             * - 数值越大，面板越靠左
             */
            PANEL_RIGHT_PX: 20,
            /** 面板宽度（像素） */
            PANEL_WIDTH_PX: 320,
            /**
             * 面板 z-index
             * - 用于确保面板显示在 12306 原有页面元素之上
             * - 如发现被遮挡，可适当调大
             */
            PANEL_Z_INDEX: 9999,
            /**
             * 面板内容区域最大高度
             * - 超出部分将出现滚动条
             */
            BODY_MAX_HEIGHT_PX: 500,
            /**
             * 日志区域的固定高度
             * - 用于显示运行过程中的提示信息
             */
            LOG_AREA_HEIGHT_PX: 150,
            /**
             * 乘客列表区域最大高度
             * - 乘客过多时将出现滚动条
             */
            PASSENGER_LIST_MAX_HEIGHT_PX: 80
        },

        //=====================================================================所有的UI===========================================================



        //=====================================================================所有的保活===========================================================
        KEEP_ALIVE: {
            /**
             * 保活请求最小间隔（毫秒）
             * - 实际间隔会在 [DELAY_MIN_MS, DELAY_MAX_MS] 中随机
             * - 数值越小，保活越频繁，风险也相对更高
             */
            DELAY_MIN_MS: 30000, // 30 秒
            /** 保活请求最大间隔（毫秒） */
            DELAY_MAX_MS: 60000, // 60 秒
            /**
             * 保活策略中“查票请求”的概率（0~1）
             * - 代表在一次保活中有多少比例是发起查询余票接口
             */
            PROB_QUERY: 0.4,
            /**
             * 保活策略中“深度保活（访问下单流程/页面）”的概率（0~1）
             * - 剩余概率会用于其它轻量保活（如仅检查登录）
             */
            PROB_DEEP: 0.4
        },

        //=====================================================================所有的倒计时===========================================================
        COUNTDOWN: {
            /**
             * 定时抢票倒计时刷新间隔（毫秒）
             * - 控制倒计时 UI 更新时间频率
             */
            INTERVAL_MS: 1000,
            /**
             * 距离开抢时间小于该值时，不再发送保活请求（毫秒）
             * - 目的：避免在关键抢票前夕占用网络资源或触发额外风控
             * - 默认：最后 2 分钟内停止保活
             */
            STOP_KEEPALIVE_WITHIN_MS: 120000,
            /**
             * 倒计时阶段日志输出间隔（毫秒）
             * - 避免日志过于频繁刷屏
             */
            LOG_EVERY_MS: 10000,
            /**
             * 倒计时最后阶段（毫秒）
             * - 例如最后 10s 内可以更频繁地输出提示信息
             */
            LOG_LAST_MS: 10000,
            FAST_WITHIN_MS: 10000,
            FAST_INTERVAL_MS: 50,
            SPIN_WITHIN_MS: 500,
            SPIN_LEAD_MS: 80
        },

        //=====================================================================所有的时间同步===========================================================
        TIME_SYNC: {
            SAMPLE_COUNT: 5,
            SAMPLE_INTERVAL_MS: 120,
            RESYNC_EVERY_MS: 30000
        },

        //=====================================================================所有的预热===========================================================
        WARMUP: {
            ENABLED: true,
            BEFORE_MS: 2000,
            METHOD: 'OPTIONS',
            URLS: ['/otn/leftTicket/submitOrderRequest']
        },


        //=====================================================================查票轮询===========================================================
        POLLING: {
            /**
             * 默认查票轮询间隔（毫秒）
             * - 主要用于“非定时模式”或者未命中其他动态策略时
             */
            DEFAULT_DELAY_MS: 1000, // 默认查询间隔

            // === 阶段 1: 闲时 (Idle) ===
            /**
             * 距离开售时间大于该阈值时，进入“闲时模式”
             * - 典型场景：开售前很久，仅需低频占位
             */
            IDLE_DIFF_GT_MS: 10000,         // 时间阈值：剩余时间大于 10 秒
            /** 闲时模式：查询间隔（毫秒），降低频率以减少压力 */
            IDLE_DELAY_MS: 10000,           // 查询间隔：每 10 秒查一次

            // === 阶段 2: 预备 (Prep) ===
            /**
             * 距离开售时间在 (PREP_DIFF_GT_MS, IDLE_DIFF_GT_MS] 区间时进入“预备模式”
             * - 典型场景：开售前数秒到十秒，开始逐步提高频率
             */
            PREP_DIFF_GT_MS: 2000,          // 时间阈值：剩余时间大于 2 秒
            /** 预备模式：查询间隔（毫秒），适中频率 */
            PREP_DELAY_MS: 1000,            // 查询间隔：每 1 秒查一次

            // === 阶段 3: 冲刺 (Sprint) ===
            /**
             * 距离开售时间在 (SPRINT_DIFF_GT_MS, PREP_DIFF_GT_MS] 区间时进入“冲刺模式”
             * - 典型场景：最后数百毫秒到 2 秒内，加大查询密度
             */
            SPRINT_DIFF_GT_MS: 500,         // 时间阈值：剩余时间大于 0.5 秒
            /** 冲刺模式：查询间隔（毫秒），更高频率 */
            SPRINT_DELAY_MS: 500,           // 查询间隔：每 0.5 秒查一次

            // === 阶段 4: 极速 (Ultra) - 最关键阶段 ===
            /**
             * 距离开售时间在 (ULTRA_DIFF_GT_MS, SPRINT_DIFF_GT_MS] 区间时进入“极速模式”
             * - 典型场景：临近开售至开售后短时间窗口
             * - 注意：负数表示“开售后”的时间，例如 -5000 代表开售后 5000 毫秒
             */
            ULTRA_DIFF_GT_MS: -5000,        // 时间阈值：直到开售后 5 秒为止
            /** 极速模式：查询间隔（毫秒），极短延迟，接近全速运行 */
            ULTRA_DELAY_MS: 1,              // 查询间隔：约等于不等待（1ms）

            // === 阶段 5: 捡漏 (After) ===
            /**
             * 开售时间过去超过 |ULTRA_DIFF_GT_MS| 毫秒后进入“捡漏模式”
             * - 典型场景：长期监控退票 / 捡漏机会
             */
            AFTER_DELAY_MS: 2000            // 查询间隔：每 2 秒查一次（兼顾安全与效果）
        },

        //=====================================================================所有的查票轮询===========================================================






        //=====================================================================所有的并发===========================================================
        WORKER: {
            /**
             * 正常情况下的并发“查票工作线程”数量
             * - 适当增加可以提高容错，但也会带来更多请求
             */
            NORMAL_COUNT: 1,
            /**
             * 关键时间窗口内的并发线程数量
             * - 一般在开售前后加大并发，提高成功率
             */
            CRITICAL_COUNT: 2,
            /**
             * 关键时间窗口阈值（毫秒）
             * - 当当前时间与设定的开抢时间差值在 ±CRITICAL_WINDOW_MS 之内时，
             *   使用 CRITICAL_COUNT 个并发线程
             */
            CRITICAL_WINDOW_MS: 60000,
            /**
             * 各并发线程启动时的时间错开间隔（毫秒）
             * - 避免所有线程在同一时刻同时发起请求，降低瞬时峰值
             */
            STAGGER_START_MS: 150
        },


        //=====================================================================所有的日志===========================================================
        LOG: {
            /**
             * 状态日志节流时间（毫秒）
             * - 同一类状态信息在该时间内只会输出一次
             * - 避免在高频轮询中日志狂刷，影响页面性能
             */
            STATUS_THROTTLE_MS: 2000
        },

        //=====================================================================所有的重试===========================================================
        RETRY: {
            /**
             * 发生错误/抢票流程失败后，自动重启任务的延迟（毫秒）
             * - 防止立即重启导致错误循环或过于频繁的请求
             */
            RESTART_AFTER_MS: 300
        },

        ORDER: {
            OPTIMISTIC_ENABLED: true,
            OPTIMISTIC_DELAY_MS: 40,
            OPTIMISTIC_RETRY_CONFIRM_ON_CHECK_SUCCESS: true,
            OPTIMISTIC_RETRY_DELAY_MS: 0
        },

//调试模式
        DEBUG: {
            ENABLED: false,
            TO_UI: true,
            TO_CONSOLE: true,
            MAX_QUEUE: 500,
            FLUSH_BATCH: 50
        },

        BOOT: {
            /**
             * 用户脚本启动后，初始化 UI / 站点映射 / 时间同步 等动作的延迟（毫秒）
             * - 让 12306 原始页面有时间先加载完毕
             */
            INIT_DELAY_MS: 1000
        }
    };
//=====================================================================所有的配置===========================================================































//主要的核心代码开始
    // 站点简码映射表 (Name -> Code)
    // 从 https://kyfw.12306.cn/otn/resources/js/framework/station_name.js 获取
    let stationMap = {};

    /**
     * @description 从12306官网获取最新的站点简码表，并解析存入 stationMap
     * @returns {Promise<void>} 无返回值，异步更新全局 stationMap
     */
    async function fetchStationMap() {
        try {
            console.log('正在获取站点简码表...');
            const response = await fetch(CONFIG.URL.STATION_MAP);
            const text = await response.text();
            // 格式: var station_names ='@bjb|北京北|VAP|beijingbei|bjb|0@bjd|北京东|BOP|beijingdong|bjd|1...'
            const start = text.indexOf("'");
            const end = text.lastIndexOf("'");
            if (start > -1 && end > -1) {
                const data = text.substring(start + 1, end);
                const parts = data.split('@');
                parts.forEach(part => {
                    if (!part) return;
                    const fields = part.split('|');
                    if (fields.length >= 3) {
                        stationMap[fields[1]] = fields[2];
                    }
                });
                const count = Object.keys(stationMap).length;
                console.log(`站点简码表加载完成，共 ${count} 个站点`);
                if (typeof UIModule !== 'undefined' && UIModule.log) {
                    UIModule.log(`站点简码表加载完成，共 ${count} 个站点`, 'success');
                }
            }
        } catch (e) {
            console.error('获取站点简码表失败:', e);
            if (typeof UIModule !== 'undefined' && UIModule.log) {
                UIModule.log('获取站点简码表失败，请检查网络', 'error');
            }
        }
    }

    // ==========================================
    // 1. NetworkModule (网络请求)
    // ==========================================
    let timeOffset = 0; // 本地时间与服务器时间的偏移量 (ms)
    let lastTimeSyncAt = 0;
    let lastTimeSyncRtt = null;

    /**
     * @description 同步服务器时间，计算本地与服务器的时间差
     * @returns {Promise<void>}
     */
    async function syncServerTime() {
        try {
            const sampleCount = (CONFIG.TIME_SYNC && CONFIG.TIME_SYNC.SAMPLE_COUNT) ? CONFIG.TIME_SYNC.SAMPLE_COUNT : 1;
            const sampleInterval = (CONFIG.TIME_SYNC && typeof CONFIG.TIME_SYNC.SAMPLE_INTERVAL_MS === 'number') ? CONFIG.TIME_SYNC.SAMPLE_INTERVAL_MS : 0;

            const results = [];
            for (let i = 0; i < sampleCount; i++) {
                const t0Abs = Date.now();
                const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : t0Abs;
                const response = await fetch(CONFIG.URL.LEFT_TICKET_INIT, { method: 'HEAD', cache: 'no-store' });
                const t1Abs = Date.now();
                const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : t1Abs;

                const serverDateStr = response.headers.get('Date');
                if (serverDateStr) {
                    const serverTime = new Date(serverDateStr).getTime();
                    const rtt = t1 - t0;
                    const estimatedServerTime = serverTime + (rtt / 2);
                    const offset = estimatedServerTime - t1Abs;
                    results.push({ offset, rtt, serverTime, t1Abs });
                }

                if (sampleInterval > 0 && i < sampleCount - 1) {
                    await new Promise(r => setTimeout(r, sampleInterval));
                }
            }

            if (results.length > 0) {
                results.sort((a, b) => a.rtt - b.rtt);
                const best = results[0];
                timeOffset = best.offset;
                lastTimeSyncAt = Date.now();
                lastTimeSyncRtt = best.rtt;
                console.log(`[TimeSync] 时间同步完成，本地落后/超前: ${timeOffset}ms (rtt=${Math.round(best.rtt * 10) / 10}ms, samples=${results.length})`);
                if (typeof UIModule !== 'undefined' && UIModule.log) {
                    UIModule.log(`时间同步完成，偏移: ${timeOffset}ms`, 'success');
                }
                if (CONFIG.DEBUG && CONFIG.DEBUG.ENABLED) {
                    DebugModule.log('TIME_SYNC', {
                        samples: results.length,
                        bestRttMs: Math.round(best.rtt * 1000) / 1000,
                        bestOffsetMs: Math.round(best.offset * 1000) / 1000,
                        rttsMs: results.map(x => Math.round(x.rtt * 1000) / 1000),
                        offsetsMs: results.map(x => Math.round(x.offset * 1000) / 1000)
                    }, 'info');
                }
            }
        } catch (e) {
            console.warn('[TimeSync] 时间同步失败，使用本地时间', e);
            if (typeof UIModule !== 'undefined' && UIModule.log) {
                UIModule.log('时间同步失败，使用本地时间', 'warn');
            }
        }
    }

    /**
     * @description 获取当前修正后的服务器时间
     * @returns {Date} 修正后的时间对象
     */
    function getServerTime() {
        return new Date(Date.now() + timeOffset);
    }

    const DebugModule = (() => {
        const queue = [];
        let scheduled = false;
        let uiLogger = null;

        const channel = (typeof MessageChannel !== 'undefined') ? new MessageChannel() : null;
        if (channel) {
            channel.port1.onmessage = () => {
                scheduled = false;
                flush();
            };
        }

        function scheduleFlush() {
            if (scheduled) return;
            scheduled = true;
            if (channel) {
                channel.port2.postMessage(0);
            } else {
                setTimeout(() => {
                    scheduled = false;
                    flush();
                }, 0);
            }
        }

        function pad3(n) {
            const s = String(n);
            if (s.length >= 3) return s;
            if (s.length === 2) return '0' + s;
            return '00' + s;
        }

        function fmtDateTime(ms) {
            const d = new Date(ms);
            return `${d.toLocaleTimeString()}.${pad3(d.getMilliseconds())}`;
        }

        function computeTargetServerMs(startTimeStr, serverNow) {
            if (!startTimeStr) return null;
            const parts = String(startTimeStr).split(':').map(Number);
            if (parts.length < 2) return null;
            const h = parts[0], m = parts[1], s = parts[2] || 0;
            const target = new Date(serverNow);
            target.setHours(h, m, s, 0);
            return target.getTime();
        }

        function enqueue(event, payload, level = 'info') {
            if (!CONFIG.DEBUG.ENABLED) return;
            const localMs = Date.now();
            const serverMs = getServerTime().getTime();
            if (queue.length >= CONFIG.DEBUG.MAX_QUEUE) {
                queue.shift();
            }
            queue.push({ event, payload, level, localMs, serverMs });
            scheduleFlush();
        }

        function flush() {
            if (!CONFIG.DEBUG.ENABLED) {
                queue.length = 0;
                return;
            }

            const batchSize = CONFIG.DEBUG.FLUSH_BATCH;
            for (let i = 0; i < batchSize && queue.length > 0; i++) {
                const item = queue.shift();
                const { event, payload, level, localMs, serverMs } = item;
                const offsetMs = serverMs - localMs;
                let targetDiffMs = null;
                if (payload && payload.startTimeStr) {
                    const targetMs = computeTargetServerMs(payload.startTimeStr, new Date(serverMs));
                    if (typeof targetMs === 'number') {
                        targetDiffMs = serverMs - targetMs;
                    }
                }

                const base = `[DBG] ${event} local=${fmtDateTime(localMs)} server=${fmtDateTime(serverMs)} offset=${offsetMs}ms`;
                const extra = (typeof targetDiffMs === 'number') ? ` targetDiff=${targetDiffMs}ms` : '';
                const msg = `${base}${extra} ${payload ? JSON.stringify(payload) : ''}`;

                if (CONFIG.DEBUG.TO_CONSOLE) {
                    if (level === 'error') console.error(msg);
                    else if (level === 'warn') console.warn(msg);
                    else console.log(msg);
                }

                if (CONFIG.DEBUG.TO_UI && typeof uiLogger === 'function') {
                    uiLogger(msg, level);
                }
            }

            if (queue.length > 0) scheduleFlush();
        }

        return {
            log: enqueue,
            computeTargetServerMs,
            setUiLogger: (fn) => { uiLogger = fn; }
        };
    })();

    const NetworkModule = (() => {
        const BASE_URL = CONFIG.URL.BASE;
        let QUERY_URL = CONFIG.NETWORK.QUERY_URL;

        /**
         * @description 发送 HTTP 请求的通用封装
         * @param {string} url - 请求地址（相对路径或绝对路径）
         * @param {Object} options - fetch 选项 (method, headers, body 等)
         * @returns {Promise<Object|string>} 返回 JSON 对象或文本内容
         */
        async function request(url, options = {}) {
            const defaultOptions = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': CONFIG.NETWORK.REFERER,
                    'Host': CONFIG.NETWORK.HOST,
                    'Origin': CONFIG.NETWORK.ORIGIN
                }
            };

            const finalOptions = { ...defaultOptions, ...options };
            if (options.headers) {
                finalOptions.headers = { ...defaultOptions.headers, ...options.headers };
            }

            const cfgKeepalive = CONFIG.NETWORK && typeof CONFIG.NETWORK.FETCH_KEEPALIVE === 'boolean' ? CONFIG.NETWORK.FETCH_KEEPALIVE : false;
            const cfgPriority = CONFIG.NETWORK && CONFIG.NETWORK.FETCH_PRIORITY ? CONFIG.NETWORK.FETCH_PRIORITY : undefined;

            if (typeof finalOptions.keepalive === 'undefined') {
                finalOptions.keepalive = cfgKeepalive;
            }
            if (typeof finalOptions.priority === 'undefined' && typeof cfgPriority !== 'undefined') {
                finalOptions.priority = cfgPriority;
            }

            if (finalOptions.keepalive && finalOptions.body) {
                let size = 0;
                try {
                    if (typeof finalOptions.body === 'string') size = finalOptions.body.length;
                    else if (finalOptions.body instanceof URLSearchParams) size = finalOptions.body.toString().length;
                } catch (e) {
                }
                if (size > 60000) {
                    finalOptions.keepalive = false;
                }
            }

            const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
            try {
                const response = await fetch(fullUrl, finalOptions);
                if (!response.ok) {
                    return { status: false, msg: `HTTP ${response.status}`, messages: [`HTTP ${response.status}`] };
                }
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return await response.json();
                }
                const text = await response.text();
                try { return JSON.parse(text); }
                catch (e) { return text; }
            } catch (error) {
                return { status: false, msg: error.message, messages: [error.message] };
            }
        }

        return {
            /**
             * @description 检查用户是否登录
             * @returns {Promise<boolean>} true 已登录, false 未登录
             */
            async checkLoginStatus() {
                try {
                    const data = await request('/otn/login/checkUser', { method: 'POST', body: '_json_att=' });
                    return data && data.data && data.data.flag === true;
                } catch (e) { return false; }
            },
            /**
             * @description 查询余票信息
             * @param {string} trainDate - 发车日期 (YYYY-MM-DD)
             * @param {string} fromStation - 出发站简码
             * @param {string} toStation - 到达站简码
             * @param {string} purposeCodes - 乘客类型代码 (默认 'ADULT')
             * @returns {Promise<Object>} 查询结果 JSON
             */
            async queryTickets(trainDate, fromStation, toStation, purposeCodes = 'ADULT') {
                const params = new URLSearchParams({
                    'leftTicketDTO.train_date': trainDate,
                    'leftTicketDTO.from_station': fromStation,
                    'leftTicketDTO.to_station': toStation,
                    'purpose_codes': purposeCodes
                });
                return request(`${QUERY_URL}?${params.toString()}`);
            },
            /**
             * @description 提交预订请求 (下单第一步)
             * @param {string} secretStr - 车次加密字符串
             * @param {string} trainDate - 发车日期
             * @param {string} backTrainDate - 返程日期 (通常同去程)
             * @param {string} fromStationName - 出发站中文名
             * @param {string} toStationName - 到达站中文名
             * @returns {Promise<Object>} 响应结果
             */
            async submitOrderRequest(secretStr, trainDate, backTrainDate, fromStationName, toStationName) {
                const body = new URLSearchParams({
                    'secretStr': decodeURIComponent(secretStr),
                    'train_date': trainDate,
                    'back_train_date': backTrainDate,
                    'tour_flag': 'dc',
                    'purpose_codes': 'ADULT',
                    'query_from_station_name': fromStationName,
                    'query_to_station_name': toStationName,
                    'undefined': ''
                });
                return request('/otn/leftTicket/submitOrderRequest', { method: 'POST', body: body });
            },
            /**
             * @description 获取下单页面初始化 HTML (下单第二步)
             * @returns {Promise<string>} 页面 HTML 文本，用于提取 Token 和 Key
             */
            async getInitDcPage() {
                try {
                    const response = await fetch(`${BASE_URL}/otn/confirmPassenger/initDc`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: '_json_att='
                    });
                    return await response.text();
                } catch (e) { throw e; }
            },
            /**
             * @description 获取常用联系人列表
             * @returns {Promise<Object>} 包含联系人列表的 JSON
             */
            async getPassengerDTOs() {
                return request('/otn/confirmPassenger/getPassengerDTOs', { method: 'POST', body: '_json_att=' });
            },
            /**
             * @description 检查订单信息 (下单第三步)
             * @param {string} passengerTicketStr - 乘客票务字符串
             * @param {string} oldPassengerStr - 旧乘客字符串
             * @param {string} tourFlag - 旅行类型 (默认 'dc')
             * @param {string} token - 提交 Token
             * @returns {Promise<Object>} 检查结果
             */
            async checkOrderInfo(passengerTicketStr, oldPassengerStr, tourFlag = 'dc', token) {
                 const body = new URLSearchParams({
                    'cancel_flag': '2',
                    'bed_level_order_num': '000000000000000000000000000000',
                    'passengerTicketStr': passengerTicketStr,
                    'oldPassengerStr': oldPassengerStr,
                    'tour_flag': tourFlag,
                    'randCode': '',
                    'whatsSelect': '1',
                    'sessionId': '',
                    'sig': '',
                    'scene': 'nc_login',
                    '_json_att': '',
                    'REPEAT_SUBMIT_TOKEN': token
                });
                return request('/otn/confirmPassenger/checkOrderInfo', { method: 'POST', body: body });
            },
            /**
             * @description 获取排队人数 (下单第四步)
             * @param {string|Date} trainDate - 发车日期
             * @param {string} trainNo - 列车编号
             * @param {string} stationTrainCode - 车次代码
             * @param {string} seatType - 席别代码
             * @param {string} fromStationTelecode - 出发站代码
             * @param {string} toStationTelecode - 到达站代码
             * @param {string} token - 提交 Token
             * @returns {Promise<Object>} 排队信息
             */
            async getQueueCount(trainDate, trainNo, stationTrainCode, seatType, fromStationTelecode, toStationTelecode, token) {
                 const body = new URLSearchParams({
                    'train_date': new Date(trainDate).toString(),
                    'train_no': trainNo,
                    'stationTrainCode': stationTrainCode,
                    'seatType': seatType,
                    'fromStationTelecode': fromStationTelecode,
                    'toStationTelecode': toStationTelecode,
                    'leftTicket': '',
                    'purpose_codes': '00',
                    'train_location': '',
                    '_json_att': '',
                    'REPEAT_SUBMIT_TOKEN': token
                });
                return request('/otn/confirmPassenger/getQueueCount', { method: 'POST', body: body });
            },
            /**
             * @description 确认提交订单 (下单第五步，最终步骤)
             * @param {string} passengerTicketStr - 乘客票务字符串
             * @param {string} oldPassengerStr - 旧乘客字符串
             * @param {string} keyCheckIsChange - 关键检查 Key
             * @param {string} token - 提交 Token
             * @param {string} leftTicketStr - 余票字符串
             * @param {string} trainLocation - 列车位置代码
             * @returns {Promise<Object>} 提交结果
             */
            async confirmSingleForQueue(passengerTicketStr, oldPassengerStr, keyCheckIsChange, token, leftTicketStr, trainLocation) {
                 const body = new URLSearchParams({
                    'passengerTicketStr': passengerTicketStr,
                    'oldPassengerStr': oldPassengerStr,
                    'purpose_codes': '00',
                    'key_check_isChange': keyCheckIsChange,
                    'leftTicketStr': leftTicketStr, // 直接传递
                    'train_location': trainLocation,
                    'choose_seats': '',
                    'seatDetailType': '000',
                    'is_jy': 'N',
                    'is_cj': 'Y',
                    'encryptedData': '',
                    'whatsSelect': '1',
                    'roomType': '00',
                    'dwAll': 'N',
                    '_json_att': '',
                    'REPEAT_SUBMIT_TOKEN': token
                });
                return request('/otn/confirmPassenger/confirmSingleForQueue', { method: 'POST', body: body });
            },
            setQueryUrl(url) { QUERY_URL = url; }
        };
    })();

    // ==========================================
    // 2. TicketLogicModule (车票解析)
    // ==========================================
    const TicketLogicModule = (() => {
        const SEAT_INDEX_MAP = {
            '商务座': 32, '一等座': 31, '二等座': 30, '特等座': 32,
            '软卧': 23, '硬卧': 28, '硬座': 29, '无座': 26
        };

        /**
         * @description 解析单条车次原始数据字符串
         * @param {string} rawString - 12306 返回的原始字符串 (以 | 分隔)
         * @returns {Object|null} 解析后的车次信息对象，解析失败返回 null
         */
        function parseTrainInfo(rawString) {
            if (!rawString) return null;
            const parts = rawString.split('|');
            if (parts.length < 30) return null;

            return {
                secretStr: parts[0],
                status: parts[1],
                trainNo: parts[2],
                trainCode: parts[3],
                fromStation: parts[6],
                toStation: parts[7],
                startTime: parts[8],
                endTime: parts[9],
                duration: parts[10],
                canBuy: parts[11],
                leftTicket: parts[12],
                trainDate: parts[13],
                trainLocation: parts[15],
                tickets: {
                    '商务座': parts[32] || '', '一等座': parts[31] || '', '二等座': parts[30] || '',
                    '软卧': parts[23] || '', '硬卧': parts[28] || '', '硬座': parts[29] || '', '无座': parts[26] || ''
                },
                raw: rawString
            };
        }

        /**
         * @description 判断是否有余票
         * @param {string} stockStr - 余票字符串 ('有', '无', 或数字)
         * @returns {boolean} true 有票, false 无票
         */
        function hasTicket(stockStr) {
            if (!stockStr) return false;
            if (stockStr === '有') return true;
            if (stockStr === '无') return false;
            const num = parseInt(stockStr, 10);
            return !isNaN(num) && num > 0;
        }

        return {
            /**
             * @description 在查询结果中查找符合条件的目标车次
             * @param {Array<string>} resultList - 查票接口返回的 result 数组
             * @param {string} targetTrainCode - 目标车次号 (如 G123)
             * @param {Array<string>} targetSeats - 目标席别列表 (如 ['二等座', '一等座'])
             * @returns {Object|null} 找到的可用车次对象，未找到返回 null
             */
            findTargetTrain(resultList, targetTrainCode, targetSeats = ['二等座']) {
                if (!resultList || !Array.isArray(resultList) || resultList.length === 0) return null;

                const targetCodeUpper = String(targetTrainCode || '').toUpperCase();
                if (!targetCodeUpper) return null;

                const seatIndexList = [];
                for (let i = 0; i < targetSeats.length; i++) {
                    const seatName = targetSeats[i];
                    const idx = SEAT_INDEX_MAP[seatName];
                    if (typeof idx === 'number') seatIndexList.push({ seatName, idx });
                }
                if (seatIndexList.length === 0) return null;

                for (let i = 0, len = resultList.length; i < len; i++) {
                    const raw = resultList[i];
                    if (!raw) continue;
                    if (raw.indexOf(targetCodeUpper) === -1) continue;

                    const parts = raw.split('|');
                    if (parts.length < 30) continue;

                    const trainCode = parts[3];
                    if (!trainCode || trainCode.toUpperCase() !== targetCodeUpper) continue;
                    if (parts[11] !== 'Y') continue;

                    for (let j = 0; j < seatIndexList.length; j++) {
                        const seatName = seatIndexList[j].seatName;
                        const idx = seatIndexList[j].idx;
                        const stockStr = parts[idx] || '';
                        if (hasTicket(stockStr)) {
                            return {
                                secretStr: parts[0],
                                trainDate: parts[13],
                                trainNo: parts[2],
                                trainCode: parts[3],
                                fromStation: parts[6],
                                toStation: parts[7],
                                seatName: seatName,
                                leftTicket: parts[12],
                                trainLocation: parts[15]
                            };
                        }
                    }
                }
                return null;
            },
            _parseTrainInfo: parseTrainInfo
        };
    })();

    // ==========================================
    // 3. OrderLogicModule (下单逻辑)
    // ==========================================
    const OrderLogicModule = (() => {
        const REGEX_TOKEN = /globalRepeatSubmitToken\s*=\s*'(\w+)'/;
        const REGEX_KEY_CHECK = /'key_check_isChange':'(\w+)'/;
        const REGEX_LEFT_TICKET = /'leftTicketStr'\s*:\s*'([^']+)'/;

        const SEAT_TYPE_CODE = {
            '商务座': '9', '特等座': 'P', '一等座': 'M', '二等座': 'O',
            '高级软卧': '6', '软卧': '4', '硬卧': '3', '硬座': '1', '无座': '1'
        };

        const TICKET_TYPE_CODE = { '成人': '1', '儿童': '2', '学生': '3', '残军': '4' };

        const passengerStringCache = new Map();

        /**
         * @description 构造提交订单所需的乘客字符串
         * @param {Array<Object>} passengers - 乘客对象列表
         * @param {string} seatCode - 席别代码
         * @returns {Object} 包含 passengerTicketStr 和 oldPassengerStr
         */
        function buildPassengerStrings(passengers, seatCode) {
            let passengerTicketList = [];
            let oldPassengerList = [];
            passengers.forEach(p => {
                let ticketType = '';
                // 如果是学生乘客并勾选了学生票，则强制使用学生票类型（'3'），否则使用乘客本身的类型或默认为成人
                if ((p.passenger_type || TICKET_TYPE_CODE[p.passenger_type_name]) == '3'){
                    ticketType = p.isStudentTicket ? '3' : '1';
                } else {
                    ticketType = (p.passenger_type || TICKET_TYPE_CODE[p.passenger_type_name] || '1');
                }
                const allEncStr = p.allEncStr || '';
                const pStr = `${seatCode},0,${ticketType},${p.passenger_name},${p.passenger_id_type_code},${p.passenger_id_no},${p.mobile_no || ''},N,${allEncStr}`;
                passengerTicketList.push(pStr);
                const oldStr = `${p.passenger_name},${p.passenger_id_type_code},${p.passenger_id_no},${ticketType}_`;
                oldPassengerList.push(oldStr);
            });
            return {
                passengerTicketStr: passengerTicketList.join('_'),
                oldPassengerStr: oldPassengerList.join('')
            };
        }

        return {
            precomputePassengerData(passengers, seatTypes) {
                try {
                    passengerStringCache.clear();
                    const uniqueSeatTypes = Array.from(new Set((seatTypes && seatTypes.length > 0) ? seatTypes : ['二等座']));
                    for (let i = 0; i < uniqueSeatTypes.length; i++) {
                        const seatCode = SEAT_TYPE_CODE[uniqueSeatTypes[i]] || 'O';
                        if (!passengerStringCache.has(seatCode)) {
                            passengerStringCache.set(seatCode, buildPassengerStrings(passengers, seatCode));
                        }
                    }
                    console.log('[OrderLogic] passenger strings precomputed');
                } catch (e) {
                    console.warn('[OrderLogic] passenger precompute failed', e);
                }
            },
            /**
             * @description 执行完整的下单流程 (Submit -> InitDc -> CheckOrder -> GetQueue -> Confirm)
             * @param {Object} trainInfo - 目标车次信息
             * @param {Array<Object>} passengers - 乘客列表
             * @returns {Promise<Object>} 结果对象 { success: boolean, error?: string }
             */
            async executeOrderSequence(trainInfo, passengers, debugCtx) {
                console.log(`[OrderLogic] Starting order sequence for ${trainInfo.trainCode}`);
                try {
                    const seatCode = SEAT_TYPE_CODE[trainInfo.seatName] || 'O';
                    let passengerTicketStr = '';
                    let oldPassengerStr = '';
                    const cached = passengerStringCache.get(seatCode);
                    if (cached) {
                        passengerTicketStr = cached.passengerTicketStr;
                        oldPassengerStr = cached.oldPassengerStr;
                    } else {
                        const res = buildPassengerStrings(passengers, seatCode);
                        passengerTicketStr = res.passengerTicketStr;
                        oldPassengerStr = res.oldPassengerStr;
                    }

                    const step0LocalMs = Date.now();
                    const step0ServerMs = getServerTime().getTime();
                    if (CONFIG.DEBUG.ENABLED) {
                        DebugModule.log('ORDER_START', {
                            trainCode: trainInfo.trainCode,
                            seatName: trainInfo.seatName,
                            startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                            sinceFoundLocalMs: debugCtx && typeof debugCtx.foundAtLocalMs === 'number' ? (step0LocalMs - debugCtx.foundAtLocalMs) : null,
                            sinceFoundServerMs: debugCtx && typeof debugCtx.foundAtServerMs === 'number' ? (step0ServerMs - debugCtx.foundAtServerMs) : null
                        }, 'info');
                    }

                    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    const submitRes = await NetworkModule.submitOrderRequest(
                        trainInfo.secretStr,
                        trainInfo.trainDate,
                        trainInfo.trainDate,
                        trainInfo.fromStation,
                        trainInfo.toStation
                    );
                    const t1e = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    if (CONFIG.DEBUG.ENABLED) {
                        DebugModule.log('ORDER_STEP_SUBMIT', {
                            trainCode: trainInfo.trainCode,
                            seatName: trainInfo.seatName,
                            startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                            costMs: Math.round((t1e - t1) * 1000) / 1000
                        }, 'info');
                    }
                    if (submitRes && submitRes.status === false) {
                        throw new Error(`Submit failed: ${submitRes.messages ? submitRes.messages.join(',') : 'Unknown error'}`);
                    }
                    console.log('[OrderLogic] Step 1 Success');

                    const t2 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    const htmlContent = await NetworkModule.getInitDcPage();
                    const t2e = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    if (CONFIG.DEBUG.ENABLED) {
                        DebugModule.log('ORDER_STEP_INITDC', {
                            trainCode: trainInfo.trainCode,
                            seatName: trainInfo.seatName,
                            startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                            costMs: Math.round((t2e - t2) * 1000) / 1000
                        }, 'info');
                    }
                    const tokenMatch = htmlContent.match(REGEX_TOKEN);
                    const keyMatch = htmlContent.match(REGEX_KEY_CHECK);
                    const leftTicketMatch = htmlContent.match(REGEX_LEFT_TICKET);

                    if (!tokenMatch || !keyMatch) throw new Error('Failed to parse Token or KeyCheck.');
                    if (!leftTicketMatch) throw new Error('Failed to parse leftTicketStr.');

                    const token = tokenMatch[1];
                    const keyCheckIsChange = keyMatch[1];
                    const leftTicketStr = leftTicketMatch[1];

                    const dateStr = trainInfo.trainDate;
                    const y = dateStr.substring(0, 4), m = dateStr.substring(4, 6), d = dateStr.substring(6, 8);
                    const dateObj = new Date(`${y}-${m}-${d}`);

                    let checkCostMs = null;
                    let queueCostMs = null;
                    const checkPromise = (async () => {
                        const t3 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        const res = await NetworkModule.checkOrderInfo(passengerTicketStr, oldPassengerStr, 'dc', token);
                        const t3e = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        checkCostMs = Math.round((t3e - t3) * 1000) / 1000;
                        return res;
                    })();

                    const queuePromise = (async () => {
                        const t4 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        const res = await NetworkModule.getQueueCount(
                            dateObj, trainInfo.trainNo, trainInfo.trainCode, seatCode,
                            trainInfo.fromStation, trainInfo.toStation, token
                        );
                        const t4e = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        queueCostMs = Math.round((t4e - t4) * 1000) / 1000;
                        return res;
                    })();

                    let checkRes = null;
                    let queueRes = null;

                    if (CONFIG.ORDER && CONFIG.ORDER.OPTIMISTIC_ENABLED) {
                        const delayMs = (CONFIG.ORDER && typeof CONFIG.ORDER.OPTIMISTIC_DELAY_MS === 'number') ? CONFIG.ORDER.OPTIMISTIC_DELAY_MS : 40;
                        if (delayMs > 0) {
                            await new Promise(r => setTimeout(r, delayMs));
                        }
                        if (CONFIG.DEBUG && CONFIG.DEBUG.ENABLED) {
                            DebugModule.log('ORDER_OPTIMISTIC_CONFIRM_FIRE', {
                                trainCode: trainInfo.trainCode,
                                seatName: trainInfo.seatName,
                                startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                                delayMs
                            }, 'info');
                        }

                        const t5 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        let confirmRes = await NetworkModule.confirmSingleForQueue(
                            passengerTicketStr, oldPassengerStr, keyCheckIsChange, token, leftTicketStr, trainInfo.trainLocation
                        );
                        const t5e = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        if (CONFIG.DEBUG.ENABLED) {
                            DebugModule.log('ORDER_STEP_CONFIRM', {
                                trainCode: trainInfo.trainCode,
                                seatName: trainInfo.seatName,
                                startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                                costMs: Math.round((t5e - t5) * 1000) / 1000,
                                submitStatus: confirmRes && confirmRes.data ? confirmRes.data.submitStatus : null,
                                errMsg: confirmRes && confirmRes.data ? confirmRes.data.errMsg : null
                            }, 'info');
                        }

                        if (confirmRes && confirmRes.data && confirmRes.data.submitStatus) {
                            console.log('🎉 [OrderLogic] ORDER SUBMITTED SUCCESSFULLY!');
                            if (CONFIG.DEBUG.ENABLED) {
                                DebugModule.log('ORDER_SUCCESS', {
                                    trainCode: trainInfo.trainCode,
                                    seatName: trainInfo.seatName,
                                    startTimeStr: debugCtx ? debugCtx.startTimeStr : ''
                                }, 'success');
                            }
                            return { success: true };
                        }

                        checkRes = await checkPromise;
                        queueRes = await queuePromise;

                        if (CONFIG.DEBUG.ENABLED) {
                            DebugModule.log('ORDER_STEP_CHECK', {
                                trainCode: trainInfo.trainCode,
                                seatName: trainInfo.seatName,
                                startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                                costMs: checkCostMs,
                                submitStatus: checkRes && checkRes.data ? checkRes.data.submitStatus : null
                            }, 'info');
                            DebugModule.log('ORDER_STEP_QUEUE', {
                                trainCode: trainInfo.trainCode,
                                seatName: trainInfo.seatName,
                                startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                                costMs: queueCostMs,
                                countT: queueRes && queueRes.data ? queueRes.data.countT : null
                            }, 'info');
                        }

                        if (CONFIG.ORDER && CONFIG.ORDER.OPTIMISTIC_RETRY_CONFIRM_ON_CHECK_SUCCESS && checkRes && checkRes.data && checkRes.data.submitStatus) {
                            const retryDelay = (CONFIG.ORDER && typeof CONFIG.ORDER.OPTIMISTIC_RETRY_DELAY_MS === 'number') ? CONFIG.ORDER.OPTIMISTIC_RETRY_DELAY_MS : 0;
                            if (retryDelay > 0) {
                                await new Promise(r => setTimeout(r, retryDelay));
                            }
                            const t5r = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                            confirmRes = await NetworkModule.confirmSingleForQueue(
                                passengerTicketStr, oldPassengerStr, keyCheckIsChange, token, leftTicketStr, trainInfo.trainLocation
                            );
                            const t5re = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                            if (CONFIG.DEBUG.ENABLED) {
                                DebugModule.log('ORDER_STEP_CONFIRM_RETRY', {
                                    trainCode: trainInfo.trainCode,
                                    seatName: trainInfo.seatName,
                                    startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                                    costMs: Math.round((t5re - t5r) * 1000) / 1000,
                                    submitStatus: confirmRes && confirmRes.data ? confirmRes.data.submitStatus : null,
                                    errMsg: confirmRes && confirmRes.data ? confirmRes.data.errMsg : null,
                                    retryDelayMs: retryDelay
                                }, 'info');
                            }
                            if (confirmRes && confirmRes.data && confirmRes.data.submitStatus) {
                                console.log('🎉 [OrderLogic] ORDER SUBMITTED SUCCESSFULLY!');
                                if (CONFIG.DEBUG.ENABLED) {
                                    DebugModule.log('ORDER_SUCCESS', {
                                        trainCode: trainInfo.trainCode,
                                        seatName: trainInfo.seatName,
                                        startTimeStr: debugCtx ? debugCtx.startTimeStr : ''
                                    }, 'success');
                                }
                                return { success: true };
                            }
                        }

                        const errMsg = (confirmRes && confirmRes.data && confirmRes.data.errMsg) || (checkRes && checkRes.data && checkRes.data.errMsg) || (confirmRes && confirmRes.msg) || 'Unknown';
                        throw new Error(`Confirm failed: ${errMsg}`);
                    }

                    [checkRes, queueRes] = await Promise.all([checkPromise, queuePromise]);

                    if (CONFIG.DEBUG.ENABLED) {
                        DebugModule.log('ORDER_STEP_CHECK', {
                            trainCode: trainInfo.trainCode,
                            seatName: trainInfo.seatName,
                            startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                            costMs: checkCostMs,
                            submitStatus: checkRes && checkRes.data ? checkRes.data.submitStatus : null
                        }, 'info');
                        DebugModule.log('ORDER_STEP_QUEUE', {
                            trainCode: trainInfo.trainCode,
                            seatName: trainInfo.seatName,
                            startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                            costMs: queueCostMs,
                            countT: queueRes && queueRes.data ? queueRes.data.countT : null
                        }, 'info');
                    }

                    if (!checkRes || !checkRes.data || !checkRes.data.submitStatus) {
                        throw new Error(`CheckOrderInfo failed: ${checkRes && checkRes.data ? checkRes.data.errMsg : 'Unknown'}`);
                    }
                    console.log('[OrderLogic] Step 3 Success');

                    if (queueRes && queueRes.data) {
                        console.log(`[OrderLogic] Queue info: count=${queueRes.data.countT}, ticket=${queueRes.data.ticket}`);
                    }

                    const t5 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    const confirmRes = await NetworkModule.confirmSingleForQueue(
                        passengerTicketStr, oldPassengerStr, keyCheckIsChange, token, leftTicketStr, trainInfo.trainLocation
                    );
                    const t5e = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    if (CONFIG.DEBUG.ENABLED) {
                        DebugModule.log('ORDER_STEP_CONFIRM', {
                            trainCode: trainInfo.trainCode,
                            seatName: trainInfo.seatName,
                            startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                            costMs: Math.round((t5e - t5) * 1000) / 1000,
                            submitStatus: confirmRes && confirmRes.data ? confirmRes.data.submitStatus : null,
                            errMsg: confirmRes && confirmRes.data ? confirmRes.data.errMsg : null
                        }, 'info');
                    }

                    if (confirmRes.data && confirmRes.data.submitStatus) {
                        console.log('🎉 [OrderLogic] ORDER SUBMITTED SUCCESSFULLY!');
                        if (CONFIG.DEBUG.ENABLED) {
                            DebugModule.log('ORDER_SUCCESS', {
                                trainCode: trainInfo.trainCode,
                                seatName: trainInfo.seatName,
                                startTimeStr: debugCtx ? debugCtx.startTimeStr : ''
                            }, 'success');
                        }
                        return { success: true };
                    } else {
                        throw new Error(`Confirm failed: ${confirmRes.data ? confirmRes.data.errMsg : 'Unknown'}`);
                    }
                } catch (error) {
                    console.error('[OrderLogic] Order Sequence Failed:', error);
                    if (CONFIG.DEBUG.ENABLED) {
                        DebugModule.log('ORDER_FAIL', {
                            startTimeStr: debugCtx ? debugCtx.startTimeStr : '',
                            err: error && error.message ? error.message : String(error)
                        }, 'error');
                    }
                    return { success: false, error: error.message };
                }
            },
            _buildPassengerStrings: buildPassengerStrings,
            REGEX_TOKEN,
            REGEX_KEY_CHECK,
            REGEX_LEFT_TICKET
        };
    })();

    // ==========================================
    // 4. CacheModule (缓存管理)
    // ==========================================
    const CacheModule = (() => {
        const CACHE_KEY = CONFIG.CACHE.KEY;

        /**
         * @description 保存配置到 localStorage
         * @param {Object} config - 配置对象
         */
        function saveCache(config) {
            try {
                const cacheData = {
                    trainDate: config.trainDate,
                    fromStation: config.fromStation,
                    toStation: config.toStation,
                    trainCodes: config.trainCodes,
                    seatTypes: config.seatTypes,
                    passengers: config.passengers,
                    startTime: config.startTime,
                    timestamp: Date.now()
                };
                localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
                console.log('[Cache] Configuration saved');
            } catch (e) {
                console.error('[Cache] Failed to save cache:', e);
            }
        }

        /**
         * @description 从 localStorage 加载配置
         * @returns {Object|null} 缓存的配置对象，失败返回 null
         */
        function loadCache() {
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const data = JSON.parse(cached);
                    console.log('[Cache] Configuration loaded from cache');
                    return data;
                }
            } catch (e) {
                console.error('[Cache] Failed to load cache:', e);
            }
            return null;
        }

        return {
            saveCache,
            loadCache
        };
    })();

    // ==========================================
    // 5. UIModule (用户界面)
    // ==========================================
    const UIModule = (() => {
        const STYLES = `
            #ticket-helper-panel {
                position: fixed; top: ${CONFIG.UI.PANEL_TOP_PX}px; right: ${CONFIG.UI.PANEL_RIGHT_PX}px; width: ${CONFIG.UI.PANEL_WIDTH_PX}px;
                background: #fff; border: 1px solid #ddd; box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: ${CONFIG.UI.PANEL_Z_INDEX}; border-radius: 8px; font-family: sans-serif; font-size: 14px;
            }
            .th-header {
                padding: 10px 15px; background: #3b82f6; color: white;
                border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;
                font-weight: bold; cursor: move;
            }
            .th-body { padding: 15px; max-height: ${CONFIG.UI.BODY_MAX_HEIGHT_PX}px; overflow-y: auto; }
            .th-form-group { margin-bottom: 12px; }
            .th-form-group label { display: block; margin-bottom: 5px; color: #374151; font-weight: 500; }
            .th-input, .th-select { width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; }
            .th-btn {
                width: 100%; padding: 10px; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; transition: background 0.2s;
            }
            .th-btn-primary { background: #3b82f6; }
            .th-btn-primary:hover { background: #2563eb; }
            .th-btn-danger { background: #ef4444; }
            .th-btn-danger:hover { background: #dc2626; }
            .th-log-area {
                margin-top: 15px; padding: 10px; background: #f3f4f6; border-radius: 4px; height: ${CONFIG.UI.LOG_AREA_HEIGHT_PX}px; overflow-y: auto; font-family: monospace; font-size: 12px; color: #333; border: 1px solid #e5e7eb;
            }
            .th-log-entry { margin-bottom: 4px; }
            .th-log-info { color: #2563eb; }
            .th-log-success { color: #059669; }
            .th-log-error { color: #dc2626; }
            .th-log-warn { color: #d97706; }
        `;

        let state = {
            isRunning: false,
            config: {
                fromStation: CONFIG.DEFAULTS.FROM_STATION_NAME, toStation: CONFIG.DEFAULTS.TO_STATION_NAME, trainDate: new Date().toISOString().split('T')[0],
                trainCodes: [], seatTypes: [], passengers: [], startTime: ''
            },
            passengersList: []
        };
        let logContainer = null, onStartCallback = null, onStopCallback = null;

        /**
         * @description 创建并插入 UI 面板到页面
         */
        function createPanel() {
            const oldPanel = document.getElementById('ticket-helper-panel');
            if (oldPanel) oldPanel.remove();
            const styleEl = document.createElement('style');
            styleEl.textContent = STYLES;
            document.head.appendChild(styleEl);

            // 加载缓存配置
            const cachedConfig = CacheModule.loadCache();
            if (cachedConfig) {
                state.config = { ...state.config, ...cachedConfig };
            }

            const panel = document.createElement('div');
            panel.id = 'ticket-helper-panel';
            panel.innerHTML = `
                <div class="th-header">
                    <span>🚄 12306 抢票助手</span>
                    <span style="font-size:12px; cursor:pointer;" onclick="document.getElementById('ticket-helper-panel').style.display='none'">✕</span>
                </div>
                <div class="th-body">
                    <div class="th-form-group">
                        <label>出发日期</label>
                        <input type="date" class="th-input" id="th-date" value="${state.config.trainDate}">
                    </div>
                    <div class="th-form-group">
                        <label>定时抢票 (可选)</label>
                        <input type="time" class="th-input" id="th-start-time" step="1" value="${state.config.startTime || ''}">
                        <div style="font-size:12px; color:#666; margin-top:2px;">设置后将在指定时间自动开始抢票</div>
                    </div>
                    <div class="th-form-group" style="display:flex; gap:10px;">
                        <div style="flex:1"><label>出发站 (中文)</label><input type="text" class="th-input" id="th-from" value="${state.config.fromStation}" placeholder="${CONFIG.DEFAULTS.FROM_STATION_PLACEHOLDER}"></div>
                        <div style="flex:1"><label>到达站 (中文)</label><input type="text" class="th-input" id="th-to" value="${state.config.toStation}" placeholder="${CONFIG.DEFAULTS.TO_STATION_PLACEHOLDER}"></div>
                    </div>
                    <div class="th-form-group">
                        <label>目标车次 (英文逗号分隔)</label>
                        <input type="text" class="th-input" id="th-trains" placeholder="${CONFIG.DEFAULTS.TRAIN_CODES_PLACEHOLDER}" value="${state.config.trainCodes.join(',')}">
                    </div>
                    <div class="th-form-group">
                        <label>席别优先 (英文逗号分隔)</label>
                        <input type="text" class="th-input" id="th-seats" value="${state.config.seatTypes.length > 0 ? state.config.seatTypes.join(',') : CONFIG.DEFAULTS.SEAT_TYPES_TEXT}" placeholder="${CONFIG.DEFAULTS.SEAT_TYPES_TEXT}">
                    </div>
                    <div class="th-form-group">
                        <label>乘车人 (需先登录)</label>
                        <div id="th-passenger-list" style="max-height:${CONFIG.UI.PASSENGER_LIST_MAX_HEIGHT_PX}px; overflow-y:auto; border:1px solid #eee; padding:5px;">
                            <span style="color:#999;">点击刷新加载乘车人...</span>
                        </div>
                        <button id="th-refresh-passengers" style="margin-top:5px; font-size:12px; padding:2px 5px;">刷新乘车人</button>
                    </div>
                    <button id="th-action-btn" class="th-btn th-btn-primary">开始抢票</button>
                    <div class="th-log-area" id="th-logs"><div class="th-log-entry th-log-info">面板已就绪...</div></div>
                </div>
            `;
            document.body.appendChild(panel);
            bindEvents();
            makeDraggable(panel);
            logContainer = document.getElementById('th-logs');

            // 恢复缓存的乘客选择
            if (cachedConfig && cachedConfig.passengers && cachedConfig.passengers.length > 0) {
                setTimeout(() => restoreCachedPassengers(cachedConfig.passengers), CONFIG.CACHE.RESTORE_PASSENGERS_DELAY_MS);
            }
        }

        /**
         * @description 绑定 UI 事件监听器
         */
        function bindEvents() {
            document.getElementById('th-action-btn').addEventListener('click', () => {
                state.isRunning ? stop() : start();
            });
            document.getElementById('th-refresh-passengers').addEventListener('click', async () => {
                log('正在获取乘客列表...', 'info');
                try {
                    const res = await NetworkModule.getPassengerDTOs();
                    if (res.data && res.data.normal_passengers) {
                        state.passengersList = res.data.normal_passengers;
                        renderPassengers(state.passengersList);
                        log(`成功获取 ${state.passengersList.length} 位乘客`, 'success');
                    } else { log('未获取到乘客，请确认已登录', 'error'); }
                } catch (e) { log('获取乘客失败: ' + e.message, 'error'); }
            });
        }

        /**
         * @description 渲染乘客列表复选框
         * @param {Array<Object>} list - 乘客数据列表
         */
        function renderPassengers(list) {
            const container = document.getElementById('th-passenger-list');
            container.innerHTML = '';
            list.forEach(p => {
                const isStudent = p.passenger_type_name === '学生' || p.passenger_type === '3';
                const div = document.createElement('div');
                div.style.marginBottom = '4px';

                let html = `<label style="display:inline-flex; align-items:center; margin-right:10px; font-weight:normal;">
                    <input type="checkbox" class="th-p-check" value="${p.passenger_name}" data-full='${JSON.stringify(p)}'> ${p.passenger_name}
                </label>`;

                if (isStudent) {
                    html += `<label style="display:inline-flex; align-items:center; font-size:12px; color:#666;">
                        <input type="checkbox" class="th-p-student-check" style="margin-left:5px;"> 学生票
                    </label>`;
                }

                div.innerHTML = html;
                container.appendChild(div);
            });
        }

        /**
         * @description 恢复缓存的乘客选择状态
         * @param {Array<Object>} cachedPassengers - 缓存的乘客列表
         */
        function restoreCachedPassengers(cachedPassengers) {
            if (!cachedPassengers || cachedPassengers.length === 0) return;
            const cachedNames = cachedPassengers.map(p => p.passenger_name);
            const cachedStudentTickets = cachedPassengers.filter(p => p.isStudentTicket).map(p => p.passenger_name);

            document.querySelectorAll('#th-passenger-list .th-p-check').forEach(checkbox => {
                if (cachedNames.includes(checkbox.value)) {
                    checkbox.checked = true;
                    // 恢复学生票选择
                    if (cachedStudentTickets.includes(checkbox.value)) {
                        const parentDiv = checkbox.closest('div');
                        const studentCheck = parentDiv.querySelector('.th-p-student-check');
                        if (studentCheck) studentCheck.checked = true;
                    }
                }
            });
        }

        /**
         * @description 获取当前 UI 配置
         * @returns {Object} 配置对象
         */
        function getConfig() {
            const date = document.getElementById('th-date').value;
            const fromName = document.getElementById('th-from').value.trim();
            const toName = document.getElementById('th-to').value.trim();

            // 尝试从 stationMap 获取简码，如果找不到则认为用户输入的就是简码
            const from = stationMap[fromName] || fromName;
            const to = stationMap[toName] || toName;

            const trains = document.getElementById('th-trains').value.split(/[,，]/).map(s => s.trim()).filter(s => s);
            const seats = document.getElementById('th-seats').value.split(/[,，]/).map(s => s.trim()).filter(s => s);
            const startTime = document.getElementById('th-start-time').value;

            const selectedPassengers = [];
            document.querySelectorAll('#th-passenger-list .th-p-check:checked').forEach(checkbox => {
                const passengerData = JSON.parse(checkbox.dataset.full);
                // 检查同一行是否勾选了“学生票”
                const parentDiv = checkbox.closest('div');
                const studentCheck = parentDiv.querySelector('.th-p-student-check');
                if (studentCheck && studentCheck.checked) {
                    passengerData.isStudentTicket = true;
                }
                selectedPassengers.push(passengerData);
            });
            return { trainDate: date, fromStation: from, toStation: to, trainCodes: trains, seatTypes: seats, passengers: selectedPassengers, startTime: startTime };
        }

        /**
         * @description 启动任务
         */
        function start() {
            const config = getConfig();
            if (config.trainCodes.length === 0) return log('请输入目标车次', 'warn');
            if (config.passengers.length === 0) return log('请选择至少一位乘车人', 'warn');
            state.config = config;
            state.isRunning = true;
            const btn = document.getElementById('th-action-btn');
            btn.textContent = '停止抢票'; btn.className = 'th-btn th-btn-danger';
            log('开始抢票任务...', 'info');
            // 保存配置到缓存
            CacheModule.saveCache(config);
            if (onStartCallback) onStartCallback(config);
        }

        /**
         * @description 停止任务
         */
        function stop() {
            state.isRunning = false;
            const btn = document.getElementById('th-action-btn');
            btn.textContent = '开始抢票'; btn.className = 'th-btn th-btn-primary';
            log('任务已停止', 'warn');
            if (onStopCallback) onStopCallback();
        }

        /**
         * @description 输出日志到面板
         * @param {string} msg - 日志消息
         * @param {string} type - 日志类型 ('info' | 'success' | 'error' | 'warn')
         */
        function log(msg, type = 'info') {
            if (!logContainer) return;
            const entry = document.createElement('div');
            entry.className = `th-log-entry th-log-${type}`;
            const time = new Date().toLocaleTimeString();
            entry.textContent = `[${time}] ${msg}`;
            logContainer.appendChild(entry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }

        /**
         * @description 使元素可拖拽
         * @param {HTMLElement} element - 目标元素
         */
        function makeDraggable(element) {
            const header = element.querySelector('.th-header');
            let isDragging = false, startX, startY, initialLeft, initialTop;
            header.addEventListener('mousedown', (e) => {
                isDragging = true; startX = e.clientX; startY = e.clientY;
                const rect = element.getBoundingClientRect(); initialLeft = rect.left; initialTop = rect.top;
                element.style.right = 'auto'; element.style.left = initialLeft + 'px'; element.style.top = initialTop + 'px';
            });
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                element.style.left = (initialLeft + e.clientX - startX) + 'px';
                element.style.top = (initialTop + e.clientY - startY) + 'px';
            });
            document.addEventListener('mouseup', () => isDragging = false);
        }

        return {
            init: (startCb, stopCb) => { createPanel(); onStartCallback = startCb; onStopCallback = stopCb; DebugModule.setUiLogger(log); log('抢票助手 UI 已初始化', 'success'); log('已自动加载上次配置', 'info'); },
            log: log,
            getIsRunning: () => state.isRunning
        };
    })();

    // ==========================================
    // 6. Main Logic (主控)
    // ==========================================
    let checkInterval = null;
    let isChecking = false;
    let countdownInterval = null;
    let taskVersion = 0;

    async function warmUpConnections() {
        if (!CONFIG.WARMUP || !CONFIG.WARMUP.ENABLED) return;
        const urls = Array.isArray(CONFIG.WARMUP.URLS) ? CONFIG.WARMUP.URLS : [];
        const method = CONFIG.WARMUP.METHOD || 'OPTIONS';
        const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (CONFIG.DEBUG && CONFIG.DEBUG.ENABLED) {
            DebugModule.log('WARMUP_START', { method, urls }, 'info');
        }
        for (let i = 0; i < urls.length; i++) {
            const u = urls[i];
            try {
                const fullUrl = u.startsWith('http') ? u : `${CONFIG.URL.BASE}${u}`;
                await fetch(fullUrl, { method, cache: 'no-store', credentials: 'include' });
            } catch (e) {
            }
        }
        const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (CONFIG.DEBUG && CONFIG.DEBUG.ENABLED) {
            DebugModule.log('WARMUP_DONE', { costMs: Math.round((t1 - t0) * 1000) / 1000 }, 'info');
        }
    }

    /**
     * @description 生成随机的保活等待时间
     * @param {Object} config - 配置对象 (未使用)
     * @returns {Promise<number>} 随机毫秒数 (30000 - 60000)
     */
    async function keepAlive(config) {
        // 随机等待 30s - 60s
        const randomDelay = Math.floor(Math.random() * (CONFIG.KEEP_ALIVE.DELAY_MAX_MS - CONFIG.KEEP_ALIVE.DELAY_MIN_MS + 1)) + CONFIG.KEEP_ALIVE.DELAY_MIN_MS;
        return randomDelay;
    }

    /**
     * @description 发送保活请求 (混合策略：查票/模拟下单/检查登录)
     * @param {Object} config - 配置对象
     */
    async function sendKeepAliveRequest(config) {
         // 随机策略：
         // 40% 查票 (模拟浏览)
         // 20% 检查登录 (轻量保活)
         // 40% 请求下单页 (深度保活 & 预热)
        const rand = Math.random();
        try {
            if (rand < CONFIG.KEEP_ALIVE.PROB_QUERY) {
                console.log('[KeepAlive] Sent silent query tickets request');
                const { trainDate, fromStation, toStation } = config;
                const queryRes = await NetworkModule.queryTickets(trainDate, fromStation, toStation);
                if (!queryRes || !queryRes.status || !queryRes.data || !queryRes.data.result) {
                    console.warn('[KeepAlive] 查票接口返回异常,可能已失效');
                } else {
                    console.log('[KeepAlive] 查票接口返回正常');
                }
            } else if (rand < (CONFIG.KEEP_ALIVE.PROB_QUERY + CONFIG.KEEP_ALIVE.PROB_DEEP)) {
                // 请求下单页面，这是最强的保活，同时检测 session 是否假死

                // 1. 先发起一个模拟的 submitOrderRequest (无需真实参数，只需让服务器认为我们在提交订单流程中)
                // 这一步对于激活 Order Session 非常关键
                try {
                    const { trainDate, fromStation, toStation } = config;
                    // 使用空的 secretStr 模拟请求，通常会返回 false，但足以激活 Session
                    await NetworkModule.submitOrderRequest('', trainDate, trainDate, fromStation, toStation);
                } catch (e) { /* 忽略错误，这只是保活 */ }

                // 2. 然后再请求 initDc
                const html = await NetworkModule.getInitDcPage();
                const tokenMatch = html.match(OrderLogicModule.REGEX_TOKEN);
                const keyMatch = html.match(OrderLogicModule.REGEX_KEY_CHECK);
                const leftTicketMatch = html.match(OrderLogicModule.REGEX_LEFT_TICKET);
                // console.log('html:', html);

                console.log('[KeepAlive] Sent initDc request (Deep Keep-Alive)')
                // if (html && (tokenMatch === null || keyMatch === null || leftTicketMatch === null)) {
                //     UIModule.log('⚠️ 警告:检测到会话可能已失效(下单页缺少Token/Key/LeftTicket)，建议立即刷新重新登录！', 'error');
                // } else {
                //     console.log('[KeepAlive] Sent initDc request (Deep Keep-Alive)');
                //     console.log('token:', tokenMatch[1]);
                //     console.log('key:', keyMatch[1]);
                //     console.log('leftTicket:', leftTicketMatch[1]);
                // }
            } else {
                console.log('[KeepAlive] Sent check user request');
                const isLoggedIn = await NetworkModule.checkLoginStatus();
                if (!isLoggedIn) {
                    console.warn('[KeepAlive] 未登录,跳过保活请求');
                }
            }
        } catch (e) {
            console.error('[KeepAlive] Request failed', e);
        }
    }

    /**
     * @description 启动抢票任务 (入口)
     * @param {Object} config - 配置对象
     */
    async function startTask(config) {
        if (isChecking) return;

        const { trainDate, fromStation, toStation, trainCodes, seatTypes, passengers, startTime } = config;

        OrderLogicModule.precomputePassengerData(passengers, seatTypes);

        // 如果设置了定时抢票，且时间未到，则进入倒计时模式
        if (startTime) {
            const serverNow = getServerTime();
            const [h, m, s] = startTime.split(':').map(Number);
            const targetTime = new Date(serverNow);
            targetTime.setHours(h, m, s || 0, 0);

            // 如果目标时间已过，假设是明天的这个时间（或者直接开始？这里逻辑取直接开始，或者提示用户）
            // 通常抢票场景是当天稍晚的时间。如果设置的时间已经过去了，就直接开始吧，或者提示警告。
            // 这里为了保险，如果设置的时间比现在晚，就倒计时；如果早，就直接开始。
            if (targetTime.getTime() > serverNow.getTime()) {
                isChecking = true; // 标记为运行中，防止重复点击
                const myCountdownVersion = ++taskVersion;
                UIModule.log(`已设置定时抢票，目标时间: ${startTime}`, 'info');
                // UIModule.log('提示: 请保持页面在前台运行，以防浏览器休眠导致抢票失败', 'warn');

                let nextKeepAliveTime = Date.now() + await keepAlive(config);

                let warmedUp = false;
                let nextResyncAt = Date.now() + ((CONFIG.TIME_SYNC && typeof CONFIG.TIME_SYNC.RESYNC_EVERY_MS === 'number') ? CONFIG.TIME_SYNC.RESYNC_EVERY_MS : 0);

                const tick = async () => {
                    if (!UIModule.getIsRunning() || taskVersion !== myCountdownVersion) {
                        if (countdownInterval) { clearTimeout(countdownInterval); countdownInterval = null; }
                        isChecking = false;
                        return;
                    }

                    const nowServerMs = getServerTime().getTime();
                    const diff = targetTime.getTime() - nowServerMs;

                    if (diff <= 0) {
                        if (countdownInterval) { clearTimeout(countdownInterval); countdownInterval = null; }
                        UIModule.log('⏰ 时间到！开始抢票！', 'success');
                        if (CONFIG.DEBUG.ENABLED) {
                            const serverNow2 = getServerTime();
                            const targetMs2 = DebugModule.computeTargetServerMs(config.startTime, serverNow2);
                            DebugModule.log('COUNTDOWN_TRIGGER', {
                                startTimeStr: config.startTime,
                                serverNowMs: serverNow2.getTime(),
                                diffToTargetMs: (typeof targetMs2 === 'number') ? (serverNow2.getTime() - targetMs2) : null
                            }, 'info');
                        }
                        isChecking = false;
                        executeTask(config);
                        return;
                    }

                    if (!warmedUp && CONFIG.WARMUP && CONFIG.WARMUP.ENABLED && diff <= CONFIG.WARMUP.BEFORE_MS) {
                        warmedUp = true;
                        warmUpConnections();
                    }

                    if (CONFIG.TIME_SYNC && typeof CONFIG.TIME_SYNC.RESYNC_EVERY_MS === 'number' && CONFIG.TIME_SYNC.RESYNC_EVERY_MS > 0) {
                        if (Date.now() >= nextResyncAt && diff > CONFIG.COUNTDOWN.SPIN_WITHIN_MS) {
                            syncServerTime();
                            nextResyncAt = Date.now() + CONFIG.TIME_SYNC.RESYNC_EVERY_MS;
                        }
                    }

                    if (diff > CONFIG.COUNTDOWN.STOP_KEEPALIVE_WITHIN_MS && Date.now() >= nextKeepAliveTime) {
                        await sendKeepAliveRequest(config);
                        nextKeepAliveTime = Date.now() + await keepAlive(config);
                    }

                    const hours = Math.floor(diff / 3600000);
                    const minutes = Math.floor((diff % 3600000) / 60000);
                    const seconds = Math.floor((diff % 60000) / 1000);
                    if (diff < CONFIG.COUNTDOWN.LOG_LAST_MS || diff % CONFIG.COUNTDOWN.LOG_EVERY_MS < CONFIG.COUNTDOWN.INTERVAL_MS) {
                        UIModule.log(`倒计时: ${hours}时${minutes}分${seconds}秒`, 'info');
                    }

                    if (diff <= CONFIG.COUNTDOWN.SPIN_WITHIN_MS) {
                        if (countdownInterval) { clearTimeout(countdownInterval); countdownInterval = null; }
                        const targetServerMs = targetTime.getTime();
                        const targetLocalMs = targetServerMs - timeOffset;
                        const lead = Math.max(0, Math.min(CONFIG.COUNTDOWN.SPIN_LEAD_MS, diff));
                        const sleepMs = Math.max(0, (targetLocalMs - Date.now()) - lead);
                        if (sleepMs > 0) {
                            await new Promise(r => setTimeout(r, sleepMs));
                        }
                        const spinStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        while (UIModule.getIsRunning() && taskVersion === myCountdownVersion) {
                            if (Date.now() >= targetLocalMs) break;
                        }
                        const spinEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        if (CONFIG.DEBUG && CONFIG.DEBUG.ENABLED) {
                            DebugModule.log('COUNTDOWN_SPIN_DONE', {
                                startTimeStr: config.startTime,
                                leadMs: lead,
                                sleptMs: sleepMs,
                                spinMs: Math.round((spinEnd - spinStart) * 1000) / 1000,
                                offsetMs: timeOffset,
                                lastSyncRttMs: lastTimeSyncRtt
                            }, 'info');
                        }
                        if (!UIModule.getIsRunning() || taskVersion !== myCountdownVersion) {
                            isChecking = false;
                            return;
                        }
                        UIModule.log('⏰ 时间到！开始抢票！', 'success');
                        if (CONFIG.DEBUG.ENABLED) {
                            const serverNow3 = getServerTime();
                            const targetMs3 = DebugModule.computeTargetServerMs(config.startTime, serverNow3);
                            DebugModule.log('COUNTDOWN_TRIGGER', {
                                startTimeStr: config.startTime,
                                serverNowMs: serverNow3.getTime(),
                                diffToTargetMs: (typeof targetMs3 === 'number') ? (serverNow3.getTime() - targetMs3) : null
                            }, 'info');
                        }
                        isChecking = false;
                        executeTask(config);
                        return;
                    }

                    const step = (diff <= CONFIG.COUNTDOWN.FAST_WITHIN_MS) ? CONFIG.COUNTDOWN.FAST_INTERVAL_MS : CONFIG.COUNTDOWN.INTERVAL_MS;
                    countdownInterval = setTimeout(tick, step);
                };

                countdownInterval = setTimeout(tick, 0);
                return;
            } else {
                 UIModule.log('设置的时间已过，立即开始抢票', 'warn');
            }
        }

        executeTask(config);
    }

    /**
     * @description 计算下次查票的动态延迟时间 (Burst Mode 变速巡航)
     * @param {Object} config - 配置对象
     * @returns {number} 延迟毫秒数
     */
    function calculatePollingDelay(config) {
        const now = getServerTime(); // 使用同步后的服务器时间
        let delay = CONFIG.POLLING.DEFAULT_DELAY_MS; // 默认延迟 (捡漏模式)

        // 如果设置了定时抢票，根据距离开售时间动态调整
        if (config.startTime) {
            const [h, m, s] = config.startTime.split(':').map(Number);
            const target = new Date(now);
            target.setHours(h, m, s || 0, 0);
            const diff = target.getTime() - now.getTime();

            if (diff > CONFIG.POLLING.IDLE_DIFF_GT_MS) {
                // 闲时模式：距离开售 > 10s，每 10s 查一次
                delay = CONFIG.POLLING.IDLE_DELAY_MS;
            } else if (diff > CONFIG.POLLING.PREP_DIFF_GT_MS) {
                // 预备模式：距离开售 2s ~ 10s，每 1s 查一次
                delay = CONFIG.POLLING.PREP_DELAY_MS;
            } else if (diff > CONFIG.POLLING.SPRINT_DIFF_GT_MS) {
                // 冲刺模式：距离开售 500ms ~ 2s，每 500ms 查一次
                delay = CONFIG.POLLING.SPRINT_DELAY_MS;
            } else if (diff > CONFIG.POLLING.ULTRA_DIFF_GT_MS) {
                // 极速模式：开售前 500ms ~ 开售后 2s 内，每 1ms 查一次 (关键时刻)
                delay = CONFIG.POLLING.ULTRA_DELAY_MS;
            } else {
                // 捡漏模式：开售超过 2s，每 2s 查一次
                delay = CONFIG.POLLING.AFTER_DELAY_MS;
            }
        }

        return delay;
    }

    /**
     * @description 执行具体的抢票逻辑 (轮询查票 -> 下单)
     * @param {Object} config - 配置对象
     */
    async function executeTask(config) {
        if (isChecking) return;
        isChecking = true;
        const myVersion = ++taskVersion;

        const { trainDate, fromStation, toStation, trainCodes, seatTypes, passengers, startTime } = config;
        UIModule.log(`目标: ${trainDate} ${fromStation}->${toStation} [${trainCodes.join(',')}]`, 'info');

        if (!/^[A-Z]+$/.test(fromStation) || !/^[A-Z]+$/.test(toStation)) {
            UIModule.log('警告: 站点似乎未转换为简码，请检查配置或输入简码', 'warn');
        }

        try {
            const loginStatus = await NetworkModule.checkLoginStatus();
            if (!loginStatus) {
                UIModule.log('未登录，请先登录！', 'error');
                isChecking = false;
                return;
            }
        } catch (e) {
            UIModule.log('检查登录状态失败', 'error');
        }

        let hasFoundTicket = false;
        let lastStatusLogAt = 0;

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        const getWorkerCount = () => {
            if (!startTime) return CONFIG.WORKER.NORMAL_COUNT;
            const now = getServerTime();
            const [h, m, s] = startTime.split(':').map(Number);
            const target = new Date(now);
            target.setHours(h, m, s || 0, 0);
            const diff = target.getTime() - now.getTime();
            if (diff <= CONFIG.WORKER.CRITICAL_WINDOW_MS && diff >= -CONFIG.WORKER.CRITICAL_WINDOW_MS) return CONFIG.WORKER.CRITICAL_COUNT;
            return CONFIG.WORKER.NORMAL_COUNT;
        };

        const workerCount = getWorkerCount();
        UIModule.log(`启动 ${workerCount} 个并发线程进行查票...`, 'info');

        const runWorker = async (workerId, initialDelay) => {
            if (initialDelay > 0) await sleep(initialDelay);
            while (UIModule.getIsRunning() && !hasFoundTicket && taskVersion === myVersion) {
                const loopStart = Date.now();
                try {
                    const now = Date.now();
                    if (now - lastStatusLogAt > CONFIG.LOG.STATUS_THROTTLE_MS) {
                        const delay = calculatePollingDelay(config);
                        UIModule.log(`正在查票... (并发: ${workerCount}, 间隔: ${delay}ms)`, 'info');
                        lastStatusLogAt = now;
                    }

                    const baseDelayMs = calculatePollingDelay(config);
                    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    const queryRes = await NetworkModule.queryTickets(trainDate, fromStation, toStation);
                    const t0e = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    const queryCostMs = Math.round((t0e - t0) * 1000) / 1000;
                    if (CONFIG.DEBUG.ENABLED) {
                        const serverNow = getServerTime();
                        const targetMs = DebugModule.computeTargetServerMs(startTime, serverNow);
                        DebugModule.log('QUERY_DONE', {
                            workerId,
                            startTimeStr: startTime,
                            costMs: queryCostMs,
                            baseDelayMs,
                            serverNowMs: serverNow.getTime(),
                            diffToTargetMs: (typeof targetMs === 'number') ? (serverNow.getTime() - targetMs) : null
                        }, 'info');
                    }
                    if (hasFoundTicket || taskVersion !== myVersion) return;

                    if (queryRes && queryRes.status && queryRes.data && queryRes.data.result) {
                        let targetTrain = null;
                        for (let i = 0; i < trainCodes.length; i++) {
                            const code = trainCodes[i];
                            const train = TicketLogicModule.findTargetTrain(queryRes.data.result, code, seatTypes);
                            if (train) { targetTrain = train; break; }
                        }

                        if (targetTrain) {
                            hasFoundTicket = true;
                            isChecking = false;
                            UIModule.log(`发现有票: ${targetTrain.trainCode} (${targetTrain.seatName})`, 'success');
                            UIModule.log('正在尝试下单...', 'info');

                            const foundAtLocalMs = Date.now();
                            const foundAtServerMs = getServerTime().getTime();
                            if (CONFIG.DEBUG.ENABLED) {
                                const targetMs = DebugModule.computeTargetServerMs(startTime, new Date(foundAtServerMs));
                                DebugModule.log('FOUND_TICKET', {
                                    workerId,
                                    trainCode: targetTrain.trainCode,
                                    seatName: targetTrain.seatName,
                                    startTimeStr: startTime,
                                    queryCostMs,
                                    foundAtLocalMs,
                                    foundAtServerMs,
                                    diffToTargetMs: (typeof targetMs === 'number') ? (foundAtServerMs - targetMs) : null
                                }, 'success');
                            }

                            const debugCtx = { foundAtLocalMs, foundAtServerMs, startTimeStr: startTime };
                            OrderLogicModule.executeOrderSequence(targetTrain, passengers, debugCtx).then(orderResult => {
                                if (taskVersion !== myVersion) return;
                                if (orderResult && orderResult.success) {
                                    UIModule.log('下单成功！请尽快支付！', 'success');
                                    alert('抢票成功！请尽快支付！');
                                } else {
                                    UIModule.log(`下单失败: ${orderResult ? orderResult.error : 'Unknown'}`, 'error');
                                    UIModule.log('3秒后自动重试...', 'warn');
                                    setTimeout(() => {
                                        if (UIModule.getIsRunning() && taskVersion === myVersion) {
                                            executeTask(config);
                                        }
                                    }, CONFIG.RETRY.RESTART_AFTER_MS);
                                }
                            });
                            return;
                        }
                    }
                } catch (e) {
                }

                const baseDelay = calculatePollingDelay(config);
                const duration = Date.now() - loopStart;
                const realDelay = Math.max(0, baseDelay - duration);
                if (CONFIG.DEBUG.ENABLED) {
                    DebugModule.log('WORKER_SLEEP', {
                        workerId,
                        startTimeStr: startTime,
                        loopDurationMs: duration,
                        baseDelayMs: baseDelay,
                        sleepMs: realDelay,
                        overtimeMs: Math.max(0, duration - baseDelay)
                    }, 'info');
                }
                if (realDelay > 0) await sleep(realDelay);
            }
        };

        const workers = [];
        for (let i = 0; i < workerCount; i++) {
            workers.push(runWorker(i, i * CONFIG.WORKER.STAGGER_START_MS));
        }
        await Promise.allSettled(workers);
        if (taskVersion === myVersion && !hasFoundTicket) {
            isChecking = false;
        }
    }

    /**
     * @description 停止所有任务 (清理定时器)
     */
    function stopTask() {
        if (checkInterval) { clearTimeout(checkInterval); checkInterval = null; }
        if (countdownInterval) { clearTimeout(countdownInterval); countdownInterval = null; }
        taskVersion++;
        isChecking = false;
        UIModule.log('已停止刷票', 'warn');
    }

    // 启动 UI
    setTimeout(async () => {
        UIModule.init(startTask, stopTask);
        await fetchStationMap(); // 启动时自动获取站点简码
        await syncServerTime();  // 同步服务器时间
    }, CONFIG.BOOT.INIT_DELAY_MS);

})();
