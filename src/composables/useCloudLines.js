/**
 * 云控线路管理 Composables
 * 支持从云端API对预设线路进行增删查改操作
 * 
 * 支持多种后端方案：
 * 1. 自定义API服务器
 * 2. GitHub/Gitee 仓库（通过 raw 文件访问）
 * 3. 本地导出/导入 JSON 文件
 */

import dialogService from '../utils/dialogService.js'

/**
 * 云控线路管理
 * @param {Object} state - 应用状态对象
 * @returns {Object} 云控线路管理方法
 */
export function useCloudLines(state) {
    const showMsg = async (msg, title) => dialogService.alert(msg, title);
    
    // 从配置中获取云控类型
    function getCloudProvider() {
        return localStorage.getItem('cloudLinesProvider') || 'api'; // 'api', 'github', 'gitee', 'local'
    }
    
    // 从配置中获取云控API地址（可以通过 localStorage 或配置文件设置）
    function getCloudApiBase() {
        // 优先从 localStorage 读取配置
        const apiBase = localStorage.getItem('cloudLinesApiBase');
        if (apiBase) {
            return apiBase;
        }
        // 默认API地址（可以根据实际情况修改）
        return 'https://api.example.com/lines'; // 替换为实际的云控API地址
    }
    
    // 获取 GitHub/Gitee 仓库配置
    function getGitRepoConfig() {
        const provider = getCloudProvider();
        if (provider === 'github') {
            return {
                owner: localStorage.getItem('cloudLinesGitHubOwner') || '',
                repo: localStorage.getItem('cloudLinesGitHubRepo') || '',
                branch: localStorage.getItem('cloudLinesGitHubBranch') || 'main',
                path: localStorage.getItem('cloudLinesGitHubPath') || 'preset-lines',
                token: localStorage.getItem('cloudLinesGitHubToken') || ''
            };
        } else if (provider === 'gitee') {
            return {
                owner: localStorage.getItem('cloudLinesGiteeOwner') || '',
                repo: localStorage.getItem('cloudLinesGiteeRepo') || '',
                branch: localStorage.getItem('cloudLinesGiteeBranch') || 'master',
                path: localStorage.getItem('cloudLinesGiteePath') || 'preset-lines',
                token: localStorage.getItem('cloudLinesGiteeToken') || ''
            };
        }
        return null;
    }
    
    // 缓存环境变量中的 Gitee Token（避免重复调用）
    let envGiteeTokenCache = null;
    let envGiteeTokenCacheLoaded = false;
    
    // 获取环境变量中的 Gitee Token（异步）
    async function getGiteeTokenFromEnv() {
        if (envGiteeTokenCacheLoaded) {
            return envGiteeTokenCache;
        }
        
        try {
            if (window.electronAPI && window.electronAPI.getGiteeTokenFromEnv) {
                const token = await window.electronAPI.getGiteeTokenFromEnv();
                envGiteeTokenCache = token;
                envGiteeTokenCacheLoaded = true;
                return token;
            }
        } catch (e) {
            console.warn('获取环境变量中的 Gitee Token 失败:', e);
        }
        
        envGiteeTokenCacheLoaded = true;
        return null;
    }
    
    // 获取认证Token（如果需要）
    async function getAuthToken() {
        const provider = getCloudProvider();
        if (provider === 'api') {
            return localStorage.getItem('cloudLinesAuthToken');
        } else if (provider === 'github') {
            return localStorage.getItem('cloudLinesGitHubToken');
        } else if (provider === 'gitee') {
            // 优先使用环境变量中的 Token
            const envToken = await getGiteeTokenFromEnv();
            if (envToken) {
                return envToken;
            }
            // 如果环境变量中没有，则使用 localStorage 中的
            return localStorage.getItem('cloudLinesGiteeToken');
        }
        return null;
    }
    
    /**
     * 发送HTTP请求（用于自定义API）
     */
    async function request(method, endpoint, data = null) {
        const apiBase = getCloudApiBase();
        const url = `${apiBase}${endpoint}`;
        
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        // 如果有token，添加到请求头
        const token = await getAuthToken();
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
        
        // 如果有数据，添加到请求体
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(url, options);
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.message || result.error || `HTTP ${response.status}`);
            }
            
            return { ok: true, data: result };
        } catch (e) {
            console.error('云控API请求失败:', e);
            return { ok: false, error: e.message };
        }
    }
    
    /**
     * 从 GitHub/Gitee 获取文件内容（通过 raw 地址）
     */
    async function getGitFileContent(filename) {
        const provider = getCloudProvider();
        const config = getGitRepoConfig();
        if (!config || !config.owner || !config.repo) {
            return { ok: false, error: '未配置 GitHub/Gitee 仓库信息' };
        }
        
        // 对文件名进行 URL 编码，确保特殊字符（如空格、括号等）能正确处理
        const encodedFilename = encodeURIComponent(filename);
        const encodedPath = encodeURIComponent(config.path || 'preset-lines');
        
        let rawUrl;
        if (provider === 'github') {
            rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${encodedPath}/${encodedFilename}`;
        } else if (provider === 'gitee') {
            rawUrl = `https://gitee.com/${config.owner}/${config.repo}/raw/${config.branch}/${encodedPath}/${encodedFilename}`;
        } else {
            return { ok: false, error: '不支持的Git提供者' };
        }
        
        try {
            const response = await fetch(rawUrl);
            if (!response.ok) {
                if (response.status === 404) {
                    return { ok: false, error: '文件不存在', notFound: true };
                }
                throw new Error(`HTTP ${response.status}`);
            }
            const content = await response.json();
            return { ok: true, data: content };
        } catch (e) {
            console.error('获取Git文件失败:', e);
            return { ok: false, error: e.message };
        }
    }
    
    /**
     * 从 GitHub/Gitee 获取文件列表（通过API）
     */
    async function getGitFileList() {
        const provider = getCloudProvider();
        const config = getGitRepoConfig();
        if (!config || !config.owner || !config.repo) {
            return { ok: false, error: '未配置 GitHub/Gitee 仓库信息' };
        }
        
        let apiUrl;
        if (provider === 'github') {
            // GitHub API: GET /repos/{owner}/{repo}/contents/{path}?ref={branch}
            apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}?ref=${config.branch}`;
        } else if (provider === 'gitee') {
            // Gitee API: GET /api/v5/repos/{owner}/{repo}/contents(/{path})?ref={branch}
            apiUrl = `https://gitee.com/api/v5/repos/${config.owner}/${config.repo}/contents/${config.path}?ref=${config.branch}`;
        } else {
            return { ok: false, error: '不支持的Git提供者' };
        }
        
        try {
            const headers = {
                'Accept': 'application/json',
                'User-Agent': 'Metro-PIDS-App'
            };
            const token = await getAuthToken();
            if (token) {
                if (provider === 'github') {
                    headers['Authorization'] = `token ${token}`;
                } else if (provider === 'gitee') {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            }
            
            const response = await fetch(apiUrl, { headers });
            if (!response.ok) {
                if (response.status === 404) {
                    return { ok: false, error: '路径不存在或仓库不存在', notFound: true };
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const files = await response.json();
            
            // GitHub API 返回数组，Gitee API 也可能返回数组或单个对象
            const fileList = Array.isArray(files) ? files : (files.type === 'dir' && files.tree ? files.tree : []);
            
            // 过滤出 JSON 文件
            const jsonFiles = fileList.filter(f => {
                const name = f.name || f.path;
                return name && name.endsWith('.json') && (f.type === 'file' || !f.type);
            });
            
            if (jsonFiles.length === 0) {
                return { ok: true, data: { lines: [] } };
            }
            
            // 获取所有文件内容
            const lines = [];
            for (const file of jsonFiles) {
                const filename = file.name || file.path;
                try {
                    const contentResult = await getGitFileContent(filename);
                    if (contentResult.ok && contentResult.data) {
                        lines.push(contentResult.data);
                    } else if (!contentResult.notFound) {
                        console.warn(`获取文件 ${filename} 失败:`, contentResult.error);
                    }
                } catch (e) {
                    console.warn(`处理文件 ${filename} 时出错:`, e);
                }
            }
            
            return { ok: true, data: { lines } };
        } catch (e) {
            console.error('获取Git文件列表失败:', e);
            return { ok: false, error: e.message };
        }
    }
    
    /**
     * 查询所有预设线路列表
     * @returns {Promise<Array>} 线路列表
     */
    async function listCloudLines() {
        const provider = getCloudProvider();
        
        if (provider === 'github' || provider === 'gitee') {
            const result = await getGitFileList();
            if (result.ok && result.data) {
                return { ok: true, lines: result.data.lines || [] };
            }
            return { ok: false, error: result.error || '获取线路列表失败', lines: [] };
        } else if (provider === 'local') {
            // 本地模式：从 localStorage 读取
            try {
                const stored = localStorage.getItem('cloudLinesLocalStorage');
                const data = stored ? JSON.parse(stored) : { lines: [] };
                return { ok: true, lines: data.lines || [] };
            } catch (e) {
                return { ok: false, error: e.message, lines: [] };
            }
        } else {
            // API模式
            const result = await request('GET', '/preset');
            if (result.ok && result.data) {
                return { ok: true, lines: Array.isArray(result.data) ? result.data : result.data.lines || [] };
            }
            return { ok: false, error: result.error || '获取线路列表失败', lines: [] };
        }
    }
    
    /**
     * 查询单个预设线路详情
     * @param {string} lineId - 线路ID或名称
     * @returns {Promise<Object>} 线路数据
     */
    async function getCloudLine(lineId) {
        const provider = getCloudProvider();
        const filename = sanitizeLineName(lineId) + '.json';
        
        if (provider === 'github' || provider === 'gitee') {
            const result = await getGitFileContent(filename);
            if (result.ok && result.data) {
                return { ok: true, line: result.data };
            }
            return { ok: false, error: result.error || '获取线路详情失败', line: null };
        } else if (provider === 'local') {
            // 本地模式：从 localStorage 读取
            try {
                const stored = localStorage.getItem('cloudLinesLocalStorage');
                const data = stored ? JSON.parse(stored) : { lines: [] };
                const line = data.lines.find(l => {
                    const name = l.meta?.lineName?.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
                    return name === lineId || l.meta?.lineName === lineId;
                });
                if (line) {
                    return { ok: true, line };
                }
                return { ok: false, error: '线路不存在', line: null };
            } catch (e) {
                return { ok: false, error: e.message, line: null };
            }
        } else {
            // API模式
            const result = await request('GET', `/preset/${encodeURIComponent(lineId)}`);
            if (result.ok && result.data) {
                return { ok: true, line: result.data };
            }
            return { ok: false, error: result.error || '获取线路详情失败', line: null };
        }
    }
    
    /**
     * 清理线路名称用于文件名
     */
    function sanitizeLineName(lineName) {
        if (!lineName) return 'untitled';
        // 移除颜色标记
        let cleaned = lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        // 移除不允许的字符
        cleaned = cleaned.replace(/[<>:"/\\|?*]/g, '');
        return cleaned;
    }
    
    /**
     * 创建新预设线路（仅支持API和本地模式）
     */
    async function createCloudLine(lineData) {
        if (!lineData || !lineData.meta || !lineData.meta.lineName) {
            return { ok: false, error: '线路数据无效' };
        }
        
        const provider = getCloudProvider();
        
        if (provider === 'local') {
            // 本地模式：保存到 localStorage
            try {
                const stored = localStorage.getItem('cloudLinesLocalStorage');
                const data = stored ? JSON.parse(stored) : { lines: [] };
                data.lines.push(lineData);
                localStorage.setItem('cloudLinesLocalStorage', JSON.stringify(data));
                return { ok: true, line: lineData };
            } catch (e) {
                return { ok: false, error: e.message };
            }
        } else if (provider === 'github' || provider === 'gitee') {
            // GitHub/Gitee 模式：提示用户需要手动上传文件到仓库
            await showMsg('GitHub/Gitee 模式不支持自动创建，请手动上传文件到仓库', '提示');
            return { ok: false, error: 'GitHub/Gitee 模式不支持自动创建' };
        } else {
            // API模式
            const result = await request('POST', '/preset', lineData);
            if (result.ok && result.data) {
                return { ok: true, line: result.data };
            }
            return { ok: false, error: result.error || '创建线路失败' };
        }
    }
    
    /**
     * 更新预设线路（仅支持API和本地模式）
     */
    async function updateCloudLine(lineId, lineData) {
        if (!lineData || !lineData.meta || !lineData.meta.lineName) {
            return { ok: false, error: '线路数据无效' };
        }
        
        const provider = getCloudProvider();
        
        if (provider === 'local') {
            // 本地模式：更新 localStorage
            try {
                const stored = localStorage.getItem('cloudLinesLocalStorage');
                const data = stored ? JSON.parse(stored) : { lines: [] };
                const index = data.lines.findIndex(l => {
                    const name = l.meta?.lineName?.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
                    return name === lineId || l.meta?.lineName === lineId;
                });
                if (index >= 0) {
                    data.lines[index] = lineData;
                    localStorage.setItem('cloudLinesLocalStorage', JSON.stringify(data));
                    return { ok: true, line: lineData };
                }
                return { ok: false, error: '线路不存在' };
            } catch (e) {
                return { ok: false, error: e.message };
            }
        } else if (provider === 'github' || provider === 'gitee') {
            // GitHub/Gitee 模式：提示用户需要手动更新文件
            await showMsg('GitHub/Gitee 模式不支持自动更新，请手动更新仓库中的文件', '提示');
            return { ok: false, error: 'GitHub/Gitee 模式不支持自动更新' };
        } else {
            // API模式
            const result = await request('PUT', `/preset/${encodeURIComponent(lineId)}`, lineData);
            if (result.ok && result.data) {
                return { ok: true, line: result.data };
            }
            return { ok: false, error: result.error || '更新线路失败' };
        }
    }
    
    /**
     * 删除预设线路（仅支持API和本地模式）
     */
    async function deleteCloudLine(lineId) {
        const provider = getCloudProvider();
        
        if (provider === 'local') {
            // 本地模式：从 localStorage 删除
            try {
                const stored = localStorage.getItem('cloudLinesLocalStorage');
                const data = stored ? JSON.parse(stored) : { lines: [] };
                const index = data.lines.findIndex(l => {
                    const name = l.meta?.lineName?.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
                    return name === lineId || l.meta?.lineName === lineId;
                });
                if (index >= 0) {
                    data.lines.splice(index, 1);
                    localStorage.setItem('cloudLinesLocalStorage', JSON.stringify(data));
                    return { ok: true };
                }
                return { ok: false, error: '线路不存在' };
            } catch (e) {
                return { ok: false, error: e.message };
            }
        } else if (provider === 'github' || provider === 'gitee') {
            // GitHub/Gitee 模式：提示用户需要手动删除文件
            await showMsg('GitHub/Gitee 模式不支持自动删除，请手动删除仓库中的文件', '提示');
            return { ok: false, error: 'GitHub/Gitee 模式不支持自动删除' };
        } else {
            // API模式
            const result = await request('DELETE', `/preset/${encodeURIComponent(lineId)}`);
            if (result.ok) {
                return { ok: true };
            }
            return { ok: false, error: result.error || '删除线路失败' };
        }
    }
    
    /**
     * 上传文件到云端（导出功能）
     */
    async function exportToFile() {
        try {
            const result = await listCloudLines();
            if (!result.ok) {
                await showMsg('导出失败: ' + result.error, '错误');
                return { ok: false, error: result.error };
            }
            
            const data = {
                lines: result.lines,
                exportedAt: new Date().toISOString(),
                version: '1.0'
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `preset-lines-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            await showMsg('导出成功', '成功');
            return { ok: true };
        } catch (e) {
            await showMsg('导出失败: ' + e.message, '错误');
            return { ok: false, error: e.message };
        }
    }
    
    /**
     * 从文件导入（导入功能）
     */
    async function importFromFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    resolve({ ok: false, error: '未选择文件' });
                    return;
                }
                
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    if (!data.lines || !Array.isArray(data.lines)) {
                        await showMsg('文件格式无效', '错误');
                        resolve({ ok: false, error: '文件格式无效' });
                        return;
                    }
                    
                    // 保存到本地存储
                    if (getCloudProvider() === 'local') {
                        localStorage.setItem('cloudLinesLocalStorage', JSON.stringify(data));
                        await showMsg(`成功导入 ${data.lines.length} 条线路`, '成功');
                        resolve({ ok: true, lines: data.lines });
                    } else {
                        await showMsg('当前模式不支持导入，已切换到本地模式', '提示');
                        localStorage.setItem('cloudProvider', 'local');
                        localStorage.setItem('cloudLinesLocalStorage', JSON.stringify(data));
                        resolve({ ok: true, lines: data.lines });
                    }
                } catch (e) {
                    await showMsg('导入失败: ' + e.message, '错误');
                    resolve({ ok: false, error: e.message });
                }
            };
            input.click();
        });
    }
    
    /**
     * 同步云端线路到本地
     */
    async function syncCloudLineToLocal(lineId) {
        const result = await getCloudLine(lineId);
        if (!result.ok || !result.line) {
            return result;
        }
        
        // 将云端线路添加到本地列表
        if (state && state.store && state.store.list) {
            const lineData = result.line;
            const idx = state.store.list.findIndex(l => 
                l.meta && l.meta.lineName === lineData.meta?.lineName
            );
            
            if (idx >= 0) {
                // 如果已存在，更新
                state.store.list[idx] = lineData;
            } else {
                // 如果不存在，添加
                state.store.list.push(lineData);
            }
            
            // 如果当前没有选中线路，选中刚同步的线路
            if (state.store.cur < 0 || state.store.cur >= state.store.list.length) {
                const newIdx = state.store.list.length - 1;
                state.store.cur = newIdx;
                state.appData = state.store.list[newIdx] || null;
            }
            
            return { ok: true, message: '线路已同步到本地' };
        }
        
        return { ok: false, error: '状态对象不可用' };
    }
    
    /**
     * 将本地预设线路上传到云端
     */
    async function uploadLocalLineToCloud(lineData = null) {
        // 如果没有提供线路数据，使用当前选中的线路
        if (!lineData && state && state.store && state.store.list) {
            const cur = state.store.list[state.store.cur];
            if (cur) {
                lineData = cur;
            }
        }
        
        if (!lineData || !lineData.meta || !lineData.meta.lineName) {
            return { ok: false, error: '线路数据无效' };
        }
        
        // 检查线路是否已存在于云端
        const lineName = lineData.meta.lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        const existing = await getCloudLine(lineName);
        
        if (existing.ok && existing.line) {
            // 如果已存在，执行更新
            return await updateCloudLine(lineName, lineData);
        } else {
            // 如果不存在，执行创建
            return await createCloudLine(lineData);
        }
    }
    
    /**
     * 设置云控配置
     * @param {string} provider - 提供者类型: 'api', 'github', 'gitee', 'local'
     * @param {Object} config - 配置对象
     */
    function setCloudConfig(provider = 'api', config = {}) {
        localStorage.setItem('cloudLinesProvider', provider);
        
        if (provider === 'api') {
            if (config.apiBase) {
                localStorage.setItem('cloudLinesApiBase', config.apiBase);
            }
            if (config.token !== undefined) {
                if (config.token) {
                    localStorage.setItem('cloudLinesAuthToken', config.token);
                } else {
                    localStorage.removeItem('cloudLinesAuthToken');
                }
            }
        } else if (provider === 'github') {
            if (config.owner) localStorage.setItem('cloudLinesGitHubOwner', config.owner);
            if (config.repo) localStorage.setItem('cloudLinesGitHubRepo', config.repo);
            if (config.branch) localStorage.setItem('cloudLinesGitHubBranch', config.branch);
            if (config.path) localStorage.setItem('cloudLinesGitHubPath', config.path);
            if (config.token !== undefined) {
                if (config.token) {
                    localStorage.setItem('cloudLinesGitHubToken', config.token);
                } else {
                    localStorage.removeItem('cloudLinesGitHubToken');
                }
            }
        } else if (provider === 'gitee') {
            if (config.owner) localStorage.setItem('cloudLinesGiteeOwner', config.owner);
            if (config.repo) localStorage.setItem('cloudLinesGiteeRepo', config.repo);
            if (config.branch) localStorage.setItem('cloudLinesGiteeBranch', config.branch);
            if (config.path) localStorage.setItem('cloudLinesGiteePath', config.path);
            if (config.token !== undefined) {
                if (config.token) {
                    localStorage.setItem('cloudLinesGiteeToken', config.token);
                } else {
                    localStorage.removeItem('cloudLinesGiteeToken');
                }
            }
        }
    }
    
    /**
     * 获取云控配置
     */
    async function getCloudConfig() {
        const provider = getCloudProvider();
        const token = await getAuthToken();
        const config = {
            provider,
            apiBase: provider === 'api' ? getCloudApiBase() : null,
            hasToken: !!token
        };
        
        if (provider === 'github' || provider === 'gitee') {
            const gitConfig = getGitRepoConfig();
            config.git = gitConfig;
        }
        
        return config;
    }
    
    return {
        // 基础CRUD操作
        listCloudLines,
        getCloudLine,
        createCloudLine,
        updateCloudLine,
        deleteCloudLine,
        
        // 同步操作
        syncCloudLineToLocal,
        uploadLocalLineToCloud,
        
        // 导入导出
        exportToFile,
        importFromFile,
        
        // 配置管理
        setCloudConfig,
        getCloudConfig,
        
        // 工具函数
        getCloudProvider
    };
}
