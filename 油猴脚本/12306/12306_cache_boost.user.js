// ==UserScript==
// @name         12306抢票：drzhao（添加缓存机制）
// @namespace    https://github.com/Dr-Zhao1980/Tools/blob/main/%E6%B2%B9%E7%8C%B4%E8%84%9A%E6%9C%AC/12306%E6%8A%A2%E7%A5%A8.user.js
// @version      1.2
// @description  自动查票、下单
// @author       赵圳楠
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
            const response = await fetch('https://kyfw.12306.cn/otn/resources/js/framework/station_name.js');
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

    /**
     * @description 同步服务器时间，计算本地与服务器的时间差
     * @returns {Promise<void>}
     */
    async function syncServerTime() {
        try {
            const start = Date.now();
            const response = await fetch('https://kyfw.12306.cn/otn/leftTicket/init', { method: 'HEAD' });
            const end = Date.now();
            const serverDateStr = response.headers.get('Date');
            if (serverDateStr) {
                const serverTime = new Date(serverDateStr).getTime();
                // 假设网络传输是对称的，服务器时间 = 接收到的服务器时间 + (RTT / 2)
                const rtt = end - start;
                const estimatedServerTime = serverTime + (rtt / 2);
                timeOffset = estimatedServerTime - end;
                console.log(`[TimeSync] 时间同步完成，本地落后/超前: ${timeOffset}ms`);
                if (typeof UIModule !== 'undefined' && UIModule.log) {
                    UIModule.log(`时间同步完成，偏移: ${timeOffset}ms`, 'success');
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

    const NetworkModule = (() => {
        const BASE_URL = 'https://kyfw.12306.cn';
        let QUERY_URL = '/otn/leftTicket/query';
        let requestCounter = 0;
        
        // 动态获取当前浏览器的 User-Agent，避免版本不匹配
        const CURRENT_UA = navigator.userAgent;

        // 获取更加真实的头部 - 让浏览器自动处理关键头部
        const getBaseHeaders = () => {
            return {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': '*/*', // 很多 AJAX 请求是 */*
                'Accept-Language': navigator.language || 'zh-CN,zh;q=0.9',
                // 重要：不要手动设置 User-Agent，让浏览器自己发送，这样包含 sec-ch-ua 等指纹信息
            };
        };

        // 模拟人类的反应延迟（随机 50ms - 200ms），避免并发请求过于瞬时
        const humanDelay = () => new Promise(r => setTimeout(r, Math.floor(Math.random() * 150) + 50));
        
        // 异步日志队列，避免频繁打印影响性能
        const logQueue = [];
        let logTimer = null;
        
        const asyncLog = (message, level = 'info') => {
            logQueue.push({ message, level, timestamp: Date.now() });
            if (!logTimer) {
                logTimer = setTimeout(() => {
                    const logs = logQueue.splice(0);
                    logs.forEach(log => {
                        console.log(`[Network][${log.level.toUpperCase()}] ${log.message}`);
                    });
                    logTimer = null;
                }, 100); // 每100ms批量输出一次日志
            }
        };

        /**
         * @description 发送 HTTP 请求的通用封装 (风控优化版)
         * @param {string} url - 请求地址（相对路径或绝对路径）
         * @param {Object} options - fetch 选项 (method, headers, body 等)
         * @param {number} retryCount - 重试次数 (默认3次)
         * @returns {Promise<Object|string>} 返回 JSON 对象或文本内容
         */
        async function request(url, options = {}, retryCount = 3) {
            const requestId = ++requestCounter;
            
            // 每次请求前随机等待一小会儿，模拟真实网络和处理延迟
            await humanDelay();

            const defaultOptions = {
                method: 'GET',
                headers: getBaseHeaders(), // 动态获取
                credentials: 'include',    // 必须：携带 Cookie
                timeout: 10000
            };
            
            const finalOptions = { ...defaultOptions, ...options };
            if (options.headers) {
                finalOptions.headers = { ...defaultOptions.headers, ...options.headers };
            }
            const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
            
            // 超时处理
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), finalOptions.timeout);
            finalOptions.signal = controller.signal;
            
            try {
                asyncLog(`Request: ${finalOptions.method} ${fullUrl}`, 'info');
                const response = await fetch(fullUrl, finalOptions);
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const result = await response.json();
                    asyncLog(`Success: JSON response`, 'success');
                    return result;
                } else {
                    const text = await response.text();
                    try { 
                        const result = JSON.parse(text);
                        asyncLog(`Success: Parsed JSON from text`, 'success');
                        return result;
                    }
                    catch (e) { 
                        asyncLog(`Warning: Non-JSON response`, 'warn');
                        return { status: false, messages: ['Response is not JSON', text.substring(0, 200)] };
                    }
                }
            } catch (error) {
                clearTimeout(timeoutId);
                asyncLog(`Failed: ${error.message}`, 'error');
                
                // 重试逻辑 - 拉长重试间隔
                if (retryCount > 0 && !error.message.includes('HTTP 4')) {
                    asyncLog(`Retrying... (${retryCount} attempts left)`, 'warn');
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 1000)); // 重试间隔拉长
                    return request(url, options, retryCount - 1);
                }
                
                throw error;
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
                    // 下单页是 HTML，不需要 JSON accept
                    const response = await fetch(`${BASE_URL}/otn/confirmPassenger/initDc`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Upgrade-Insecure-Requests': '1' // 模拟浏览器导航行为
                        },
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
    // 2. TicketLogicModule (车票解析) - 优化版
    // ==========================================
    const TicketLogicModule = (() => {
        // 缓存解析结果，避免重复计算
        const parseCache = new Map();
        
        const SEAT_INDEX_MAP = {
            '商务座': 32, '一等座': 31, '二等座': 30, '特等座': 32,
            '软卧': 23, '硬卧': 28, '硬座': 29, '无座': 26
        };

        /**
         * @description 解析单条车次原始数据字符串 (优化版)
         * @param {string} rawString - 12306 返回的原始字符串 (以 | 分隔)
         * @returns {Object|null} 解析后的车次信息对象，解析失败返回 null
         */
        function parseTrainInfo(rawString) {
            if (!rawString) return null;
            
            // 使用缓存避免重复解析
            if (parseCache.has(rawString)) {
                return parseCache.get(rawString);
            }
            
            const parts = rawString.split('|');
            if (parts.length < 30) return null;

            const info = {
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
            
            // 缓存结果 (限制缓存大小)
            if (parseCache.size > 1000) {
                parseCache.clear();
            }
            parseCache.set(rawString, info);
            
            return info;
        }

        /**
         * @description 判断是否有余票 (优化版)
         * @param {string} stockStr - 余票字符串 ('有', '无', 或数字)
         * @returns {boolean} true 有票, false 无票
         */
        function hasTicket(stockStr) {
            if (!stockStr || stockStr === '无' || stockStr === '') return false;
            if (stockStr === '有') return true;
            // 快速数字检查
            const firstChar = stockStr.charCodeAt(0);
            if (firstChar >= 48 && firstChar <= 57) { // '0' to '9'
                return parseInt(stockStr, 10) > 0;
            }
            return false;
        }

        return {
            /**
             * @description 在查询结果中查找符合条件的目标车次 (优化版)
             * @param {Array<string>} resultList - 查票接口返回的 result 数组
             * @param {string} targetTrainCode - 目标车次号 (如 G123)
             * @param {Array<string>} targetSeats - 目标席别列表 (如 ['二等座', '一等座'])
             * @returns {Object|null} 找到的可用车次对象，未找到返回 null
             */
            findTargetTrain(resultList, targetTrainCode, targetSeats = ['二等座']) {
                if (!resultList || !Array.isArray(resultList)) return null;
                
                const targetCodeUpper = targetTrainCode.toUpperCase();
                
                for (let i = 0; i < resultList.length; i++) {
                    const rawStr = resultList[i];
                    const info = parseTrainInfo(rawStr);
                    if (!info) continue;
                    
                    // 快速车次匹配
                    if (info.trainCode.toUpperCase() !== targetCodeUpper) continue;
                    if (info.canBuy !== 'Y') continue;
                    
                    // 快速席别检查
                    const tickets = info.tickets;
                    for (let j = 0; j < targetSeats.length; j++) {
                        const seatName = targetSeats[j];
                        const stock = tickets[seatName];
                        if (hasTicket(stock)) {
                            return {
                                secretStr: info.secretStr,
                                trainDate: info.trainDate,
                                trainNo: info.trainNo,
                                trainCode: info.trainCode,
                                fromStation: info.fromStation,
                                toStation: info.toStation,
                                seatName: seatName,
                                leftTicket: info.leftTicket,
                                trainLocation: info.trainLocation
                            };
                        }
                    }
                }
                return null;
            },
            _parseTrainInfo: parseTrainInfo,
            clearCache: () => parseCache.clear()
        };
    })();

    // ==========================================
    // 3. OrderLogicModule (下单逻辑) - 优化版
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
        
        // 缓存 Token 和 Key，避免重复解析
        let tokenCache = null;
        let tokenCacheTime = 0;
        const TOKEN_CACHE_DURATION = 30000; // 30秒缓存

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
            /**
             * @description 执行完整的下单流程 (Submit -> InitDc -> CheckOrder -> GetQueue -> Confirm)
             * @param {Object} trainInfo - 目标车次信息
             * @param {Array<Object>} passengers - 乘客列表
             * @returns {Promise<Object>} 结果对象 { success: boolean, error?: string }
             */
            async executeOrderSequence(trainInfo, passengers) {
                console.log(`[OrderLogic] Starting order sequence for ${trainInfo.trainCode}`);
                try {
                    console.log('[OrderLogic] Step 1: Submitting order request...');
                    const submitRes = await NetworkModule.submitOrderRequest(
                        trainInfo.secretStr,
                        trainInfo.trainDate,
                        trainInfo.trainDate,
                        trainInfo.fromStation,
                        trainInfo.toStation
                    );
                    if (submitRes.status && !submitRes.status) {
                        throw new Error(`Submit failed: ${submitRes.messages ? submitRes.messages.join(',') : 'Unknown error'}`);
                    }
                    console.log('[OrderLogic] Step 1 Success');

                    console.log('[OrderLogic] Step 2: Getting token...');
                    const htmlContent = await NetworkModule.getInitDcPage();
                    console.log('[OrderLogic] Step 2 HTML Content:', htmlContent);
                    const tokenMatch = htmlContent.match(REGEX_TOKEN);
                    const keyMatch = htmlContent.match(REGEX_KEY_CHECK);
                    const leftTicketMatch = htmlContent.match(REGEX_LEFT_TICKET);

                    if (!tokenMatch || !keyMatch) throw new Error('Failed to parse Token or KeyCheck.');
                    if (!leftTicketMatch) throw new Error('Failed to parse leftTicketStr.');

                    const token = tokenMatch[1];
                    const keyCheckIsChange = keyMatch[1];
                    const leftTicketStr = leftTicketMatch[1];
                    console.log(`[OrderLogic] Token: ${token}, Key: ${keyCheckIsChange}, LeftTicket: ${leftTicketStr}`);

                    const seatCode = SEAT_TYPE_CODE[trainInfo.seatName] || 'O';
                    const { passengerTicketStr, oldPassengerStr } = buildPassengerStrings(passengers, seatCode);

                    console.log('[OrderLogic] Step 3: Checking order info...');
                    const checkRes = await NetworkModule.checkOrderInfo(passengerTicketStr, oldPassengerStr, 'dc', token);
                    if (!checkRes.data || !checkRes.data.submitStatus) {
                         throw new Error(`CheckOrderInfo failed: ${checkRes.data ? checkRes.data.errMsg : 'Unknown'}`);
                    }
                    console.log('[OrderLogic] Step 3 Success');

                    console.log('[OrderLogic] Step 4: Getting queue count...');
                    const dateStr = trainInfo.trainDate;
                    const y = dateStr.substring(0, 4), m = dateStr.substring(4, 6), d = dateStr.substring(6, 8);
                    const dateObj = new Date(`${y}-${m}-${d}`);
                    const queueRes = await NetworkModule.getQueueCount(
                        dateObj, trainInfo.trainNo, trainInfo.trainCode, seatCode,
                        trainInfo.fromStation, trainInfo.toStation, token
                    );
                    console.log(`[OrderLogic] Queue info: count=${queueRes.data.countT}, ticket=${queueRes.data.ticket}`);

                    console.log('[OrderLogic] Step 5: Confirming order...');
                    const confirmRes = await NetworkModule.confirmSingleForQueue(
                        passengerTicketStr, oldPassengerStr, keyCheckIsChange, token, leftTicketStr, trainInfo.trainLocation
                    );

                    if (confirmRes.data && confirmRes.data.submitStatus) {
                        console.log('🎉 [OrderLogic] ORDER SUBMITTED SUCCESSFULLY!');
                        return { success: true };
                    } else {
                        throw new Error(`Confirm failed: ${confirmRes.data ? confirmRes.data.errMsg : 'Unknown'}`);
                    }
                } catch (error) {
                    console.error('[OrderLogic] Order Sequence Failed:', error);
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
        const CACHE_KEY = 'ticket_helper_cache';

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
    // 5. UIModule (用户界面) - 优化版
    // ==========================================
    const UIModule = (() => {
        const STYLES = `
            #ticket-helper-panel {
                position: fixed; top: 50px; right: 20px; width: 320px;
                background: #fff; border: 1px solid #ddd; box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: 9999; border-radius: 8px; font-family: sans-serif; font-size: 14px;
            }
            .th-header {
                padding: 10px 15px; background: #3b82f6; color: white;
                border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;
                font-weight: bold; cursor: move;
            }
            .th-body { padding: 15px; max-height: 500px; overflow-y: auto; }
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
                margin-top: 15px; padding: 10px; background: #f3f4f6; border-radius: 4px; height: 150px; overflow-y: auto; font-family: monospace; font-size: 12px; color: #333; border: 1px solid #e5e7eb;
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
                fromStation: '上海', toStation: '杭州', trainDate: new Date().toISOString().split('T')[0],
                trainCodes: [], seatTypes: [], passengers: [], startTime: ''
            },
            passengersList: []
        };
        let logContainer = null, onStartCallback = null, onStopCallback = null;
        
        // 预加载的乘客信息缓存
        let preloadedPassengers = null;
        let passengerLoadTime = 0;
        const PASSENGER_CACHE_DURATION = 300000; // 5分钟缓存

        /**
         * @description 预加载乘客信息 (优化版)
         * @returns {Promise<Array>} 乘客列表
         */
        async function preloadPassengers() {
            const now = Date.now();
            
            // 检查缓存是否有效
            if (preloadedPassengers && (now - passengerLoadTime) < PASSENGER_CACHE_DURATION) {
                console.log('[UI] Using cached passengers');
                return preloadedPassengers;
            }
            
            try {
                console.log('[UI] Preloading passengers...');
                const res = await NetworkModule.getPassengerDTOs();
                if (res.data && res.data.normal_passengers) {
                    preloadedPassengers = res.data.normal_passengers;
                    passengerLoadTime = now;
                    console.log(`[UI] Preloaded ${preloadedPassengers.length} passengers`);
                    return preloadedPassengers;
                }
            } catch (e) {
                console.warn('[UI] Failed to preload passengers:', e.message);
            }
            
            return [];
        }

        /**
         * @description 创建并插入 UI 面板到页面 (优化版)
         */
        async function createPanel() {
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
            
            // 预加载乘客信息
            await preloadPassengers();

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
                        <div style="flex:1"><label>出发站 (中文)</label><input type="text" class="th-input" id="th-from" value="${state.config.fromStation}" placeholder="如 上海"></div>
                        <div style="flex:1"><label>到达站 (中文)</label><input type="text" class="th-input" id="th-to" value="${state.config.toStation}" placeholder="如 杭州"></div>
                    </div>
                    <div class="th-form-group">
                        <label>目标车次 (逗号分隔)</label>
                        <input type="text" class="th-input" id="th-trains" placeholder="如 G123,G456" value="${state.config.trainCodes.join(',')}">
                    </div>
                    <div class="th-form-group">
                        <label>席别优先 (逗号分隔)</label>
                        <input type="text" class="th-input" id="th-seats" value="${state.config.seatTypes.length > 0 ? state.config.seatTypes.join(',') : '二等座,一等座'}" placeholder="二等座,一等座">
                    </div>
                    <div class="th-form-group">
                        <label>乘车人 (需先登录)</label>
                        <div id="th-passenger-list" style="max-height:80px; overflow-y:auto; border:1px solid #eee; padding:5px;">
                            ${preloadedPassengers && preloadedPassengers.length > 0 ? 
                                '<span style="color:#059669;">已预加载 ' + preloadedPassengers.length + ' 位乘客</span>' : 
                                '<span style="color:#999;">点击刷新加载乘车人...</span>'
                            }
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

            // 如果有预加载的乘客信息，直接渲染
            if (preloadedPassengers && preloadedPassengers.length > 0) {
                state.passengersList = preloadedPassengers;
                renderPassengers(preloadedPassengers);
            }

            // 恢复缓存的乘客选择
            if (cachedConfig && cachedConfig.passengers && cachedConfig.passengers.length > 0) {
                setTimeout(() => restoreCachedPassengers(cachedConfig.passengers), 500);
            }
        }

        /**
         * @description 绑定 UI 事件监听器 (优化版)
         */
        function bindEvents() {
            document.getElementById('th-action-btn').addEventListener('click', () => {
                state.isRunning ? stop() : start();
            });
            document.getElementById('th-refresh-passengers').addEventListener('click', async () => {
                log('正在获取乘客列表...', 'info');
                try {
                    // 强制刷新缓存
                    preloadedPassengers = null;
                    const passengers = await preloadPassengers();
                    if (passengers.length > 0) {
                        state.passengersList = passengers;
                        renderPassengers(passengers);
                        log(`成功获取 ${passengers.length} 位乘客`, 'success');
                    } else {
                        log('未获取到乘客，请确认已登录', 'error');
                    }
                } catch (e) { 
                    log('获取乘客失败: ' + e.message, 'error'); 
                }
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
            init: async (startCb, stopCb) => { 
                await createPanel(); 
                onStartCallback = startCb; 
                onStopCallback = stopCb; 
                log('抢票助手 UI 已初始化', 'success'); 
                log('已自动加载上次配置', 'info');
                if (preloadedPassengers) {
                    log(`已预加载 ${preloadedPassengers.length} 位乘客信息`, 'success');
                }
            },
            log: log,
            getIsRunning: () => state.isRunning,
            getPreloadedPassengers: () => preloadedPassengers
        };
    })();

    // ==========================================
    // 6. Main Logic (主控)
    // ==========================================
    let checkInterval = null;
    let isChecking = false;
    let countdownInterval = null;

    /**
     * @description 生成随机的保活等待时间
     * @param {Object} config - 配置对象 (未使用)
     * @returns {Promise<number>} 随机毫秒数 (30000 - 60000)
     */
    async function keepAlive(config) {
        // 随机等待 30s - 60s
        const randomDelay = Math.floor(Math.random() * (60000 - 30000 + 1)) + 30000;
        return randomDelay;
    }

    /**
     * @description 发送保活请求 (风控优化版 - 移除高危模拟下单)
     * @param {Object} config - 配置对象
     */
    async function sendKeepAliveRequest(config) {
        // 纯浏览行为保活，不要发送 submitOrderRequest，那个在没有真实交互时发送极其可疑
        try {
            console.log('[KeepAlive] Checking login status for heartbeat...');
            const isLoggedIn = await NetworkModule.checkLoginStatus();
            if (!isLoggedIn) {
                console.warn('[KeepAlive] User not logged in, heartbeat may be ineffective');
            } else {
                console.log('[KeepAlive] Heartbeat successful');
            }
        } catch (e) {
            console.warn('[KeepAlive] Heartbeat failed:', e.message);
        }
    }

    /**
     * @description 启动抢票任务 (入口)
     * @param {Object} config - 配置对象
     */
    async function startTask(config) {
        if (isChecking) return;

        const { trainDate, fromStation, toStation, trainCodes, seatTypes, passengers, startTime } = config;

        // 如果设置了定时抢票，且时间未到，则进入倒计时模式
        if (startTime) {
            const now = new Date();
            const [h, m, s] = startTime.split(':').map(Number);
            const targetTime = new Date();
            targetTime.setHours(h, m, s || 0, 0);

            // 如果目标时间已过，假设是明天的这个时间（或者直接开始？这里逻辑取直接开始，或者提示用户）
            // 通常抢票场景是当天稍晚的时间。如果设置的时间已经过去了，就直接开始吧，或者提示警告。
            // 这里为了保险，如果设置的时间比现在晚，就倒计时；如果早，就直接开始。
            if (targetTime > now) {
                isChecking = true; // 标记为运行中，防止重复点击
                UIModule.log(`已设置定时抢票，目标时间: ${startTime}`, 'info');
                // UIModule.log('提示: 请保持页面在前台运行，以防浏览器休眠导致抢票失败', 'warn');

                let nextKeepAliveTime = Date.now() + await keepAlive(config);

                // 启动倒计时
                countdownInterval = setInterval(async () => {
                    if (!UIModule.getIsRunning()) {
                        clearInterval(countdownInterval);
                        isChecking = false;
                        return;
                    }

                    const currentNow = new Date();
                    const diff = targetTime - currentNow;

                    if (diff <= 0) {
                        clearInterval(countdownInterval);
                        UIModule.log('⏰ 时间到！开始抢票！', 'success');
                        isChecking = false; // 重置标志位以便 executeTask 能正常运行
                        executeTask(config);
                    } else {
                        // 动态随机间隔保活
                        // 为了避免在即将抢票的关键时刻（例如最后2分钟）发送保活请求导致网络拥堵或被风控
                        // 我们设置一个阈值：如果距离目标时间小于 120000ms (2分钟)，则停止发送新的保活请求
                        if (diff > 120000 && Date.now() >= nextKeepAliveTime) {
                             await sendKeepAliveRequest(config);
                             nextKeepAliveTime = Date.now() + await keepAlive(config);
                        }

                        // 显示倒计时
                        const hours = Math.floor(diff / 3600000);
                        const minutes = Math.floor((diff % 3600000) / 60000);
                        const seconds = Math.floor((diff % 60000) / 1000);
                        // 可以在日志里刷屏，也可以只在最后几秒刷。这里为了简洁，每10秒或最后10秒输出日志
                        if (diff < 10000 || diff % 10000 < 1000) {
                             UIModule.log(`倒计时: ${hours}时${minutes}分${seconds}秒`, 'info');
                        }
                    }
                }, 1000);
                return;
            } else {
                 UIModule.log('设置的时间已过，立即开始抢票', 'warn');
            }
        }

        executeTask(config);
    }

    /**
     * @description 计算下次查票的动态延迟时间 (Burst Mode 变速巡航 + 随机抖动)
     * @param {Object} config - 配置对象
     * @returns {number} 延迟毫秒数
     */
    function calculatePollingDelay(config) {
        const now = getServerTime(); // 使用同步后的服务器时间
        let baseDelay = 1000; // 默认延迟 (捡漏模式)
        
        // 如果设置了定时抢票，根据距离开售时间动态调整
        if (config.startTime) {
            const [h, m, s] = config.startTime.split(':').map(Number);
            const target = new Date(now);
            target.setHours(h, m, s || 0, 0);
            const diff = target.getTime() - now.getTime();

            if (diff > 10000) {
                // 闲时模式：距离开售 > 10s，每 10s 查一次
                baseDelay = 10000;
            } else if (diff > 2000) {
                // 预备模式：距离开售 2s ~ 10s，每 1s 查一次
                baseDelay = 1000;
            } else if (diff > 500) {
                // 冲刺模式：距离开售 500ms ~ 2s，每 500ms 查一次
                baseDelay = 500;
            } else if (diff > -2000) {
                // 极速模式：开售前 500ms ~ 开售后 2s 内，每 300ms 查一次 (关键时刻)
                baseDelay = 300;
            } else {
                // 捡漏模式：开售超过 2s，每 2s 查一次
                baseDelay = 2000;
            }
        }
        
        // 增加随机抖动，避免机械行为
        // 在原基础上增加 20ms 的随机抖动
        const jitter = Math.floor(Math.random() * 40) - 20; // -20ms 到 +20ms
        const finalDelay = Math.max(50, baseDelay + jitter); // 最小延迟 50ms
        
        return finalDelay;
    }

    /**
     * @description 执行具体的抢票逻辑 (轮询查票 -> 下单)
     * @param {Object} config - 配置对象
     */
    async function executeTask(config) {
        if (isChecking) return;
        isChecking = true;

        const { trainDate, fromStation, toStation, trainCodes, seatTypes, passengers } = config;
        UIModule.log(`目标: ${trainDate} ${fromStation}->${toStation} [${trainCodes.join(',')}]`, 'info');

        // 简单校验简码格式 (全大写字母)
        if (!/^[A-Z]+$/.test(fromStation) || !/^[A-Z]+$/.test(toStation)) {
            UIModule.log('警告: 站点似乎未转换为简码，请检查配置或输入简码', 'warn');
        }

        try {
            const loginStatus = await NetworkModule.checkLoginStatus();
            if (!loginStatus) {
                UIModule.log('未登录，请先登录！', 'error');
                isChecking = false;
                // 如果是定时任务，此时停止会很尴尬。但未登录确实没法抢。
                return;
            }
        } catch (e) { UIModule.log('检查登录状态失败', 'error'); }

        /**
         * @description 执行单次查票并调度下次查询 (递归 setTimeout 实现变速巡航)
         */
        async function scheduleNextCheck() {
            if (!UIModule.getIsRunning()) {
                isChecking = false;
                return;
            }

            try {
                const delay = calculatePollingDelay(config);
                UIModule.log(`正在查票... (间隔: ${delay}ms)`, 'info');
                const queryRes = await NetworkModule.queryTickets(trainDate, fromStation, toStation);

                if (!queryRes.status || !queryRes.data.result) {
                    UIModule.log('查票接口返回异常', 'warn');
                    // 继续下次调度
                    checkInterval = setTimeout(scheduleNextCheck, delay);
                    return;
                }

                let targetTrain = null;
                for (const code of trainCodes) {
                    const train = TicketLogicModule.findTargetTrain(queryRes.data.result, code, seatTypes);
                    if (train) { targetTrain = train; break; }
                }

                if (targetTrain) {
                    UIModule.log(`🎉 发现有票: ${targetTrain.trainCode} (${targetTrain.seatName})`, 'success');
                    UIModule.log('正在尝试下单...', 'info');

                    isChecking = false;

                    const orderResult = await OrderLogicModule.executeOrderSequence(targetTrain, passengers);

                    if (orderResult.success) {
                        UIModule.log('✅ 下单成功！请尽快支付！', 'success');
                        alert('抢票成功！请尽快支付！');
                    } else {
                        UIModule.log(`❌ 下单失败: ${orderResult.error}`, 'error');
                        UIModule.log('3秒后自动重试...', 'warn');
                        setTimeout(() => {
                            if (UIModule.getIsRunning()) {
                                isChecking = false;
                                executeTask(config);
                            }
                        }, 3000);
                    }
                } else {
                    // 没有找到票，继续调度下次查询
                    checkInterval = setTimeout(scheduleNextCheck, delay);
                }

            } catch (e) {
                UIModule.log(`查票出错: ${e.message}`, 'error');
                // 出错也继续调度
                const delay = calculatePollingDelay(config);
                checkInterval = setTimeout(scheduleNextCheck, delay);
            }
        }

        // 启动首次查票
        scheduleNextCheck();
    }

    /**
     * @description 停止所有任务 (清理定时器)
     */
    function stopTask() {
        if (checkInterval) { clearTimeout(checkInterval); checkInterval = null; }
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        isChecking = false;
        UIModule.log('已停止刷票', 'warn');
    }

    // 启动 UI (优化版)
    setTimeout(async () => {
        await UIModule.init(startTask, stopTask);
        
        // 并行执行初始化任务，提升启动速度
        const initTasks = [
            fetchStationMap(),      // 获取站点简码表
            syncServerTime(),       // 同步服务器时间
            preloadCriticalData()   // 预加载关键数据
        ];
        
        try {
            await Promise.all(initTasks);
            console.log('[Init] All initialization tasks completed');
        } catch (e) {
            console.warn('[Init] Some initialization tasks failed:', e);
        }
    }, 1000);
    
    /**
     * @description 预加载关键数据，优化抢票速度
     * @returns {Promise<void>}
     */
    async function preloadCriticalData() {
        try {
            // 预加载乘客信息（如果还没有）
            const passengers = UIModule.getPreloadedPassengers();
            if (!passengers || passengers.length === 0) {
                console.log('[Init] Preloading passengers for better performance...');
                await NetworkModule.getPassengerDTOs();
            }
            
            // 预热下单页面，获取Token缓存
            console.log('[Init] Warming up order session...');
            await NetworkModule.getInitDcPage();
            
            console.log('[Init] Critical data preloaded successfully');
        } catch (e) {
            console.warn('[Init] Failed to preload some critical data:', e);
        }
    }

})();
