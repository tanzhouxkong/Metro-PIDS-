// 将 preset-lines 目录下的线路 JSON 批量上传到 Cloudflare Worker API
// 使用方式（项目根目录）：
//   1) 确保 Cloudflare Worker 已部署，并且支持 /preset 接口
//   2) 设置环境变量：
//        CF_LINES_API_BASE=https://your-worker-subdomain.workers.dev
//        CF_LINES_TOKEN=your_token   （如果 Worker 开启了 CLOUD_TOKEN）
//   3) 运行：
//        node scripts/upload-preset-lines-to-cloudflare.js
//
// 仅会对每个 meta.lineName 对应的线路执行 POST /preset，如果已存在会报 409，
// 可根据需要改成 PUT。

const fs = require('fs');
const path = require('path');

const API_BASE =
  process.env.CF_LINES_API_BASE ||
  'https://your-worker-subdomain.workers.dev';
const TOKEN = process.env.CF_LINES_TOKEN || '';
const PRESET_DIR = path.resolve(__dirname, '..', 'preset-lines');

async function main() {
  console.log('[cf-upload] 目标 API_BASE =', API_BASE);
  console.log('[cf-upload] 预设线路目录 =', PRESET_DIR);

  if (!fs.existsSync(PRESET_DIR)) {
    console.error('[cf-upload] 预设线路目录不存在:', PRESET_DIR);
    process.exit(1);
  }

  const files = fs
    .readdirSync(PRESET_DIR)
    .filter((f) => f.toLowerCase().endsWith('.json'));

  if (files.length === 0) {
    console.warn('[cf-upload] 未在 preset-lines 中找到任何 JSON 文件。');
    return;
  }

  let okCount = 0;
  let failCount = 0;

  for (const file of files) {
    const fullPath = path.join(PRESET_DIR, file);
    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const json = JSON.parse(raw);
      if (!json?.meta?.lineName) {
        console.warn(
          `[cf-upload] 略过 ${file}：缺少 meta.lineName 字段。`
        );
        continue;
      }
      const lineName = json.meta.lineName;
      console.log(`[cf-upload] 上传线路 "${lineName}" (${file})...`);

      const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/preset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
        },
        body: JSON.stringify(json)
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(
          `[cf-upload] 成功: ${lineName} -> status=${res.status} ${data?.error || ''
          }`
        );
        okCount++;
      } else if (res.status === 409) {
        console.warn(
          `[cf-upload] 已存在: ${lineName} (HTTP 409)，如需覆盖请改用 PUT 接口。`
        );
        failCount++;
      } else {
        const text = await res.text().catch(() => '');
        console.error(
          `[cf-upload] 失败: ${lineName} -> status=${res.status}, body=${text}`
        );
        failCount++;
      }
    } catch (e) {
      console.error(`[cf-upload] 文件 ${file} 处理失败:`, e);
      failCount++;
    }
  }

  console.log(
    `[cf-upload] 处理完成：成功 ${okCount} 条，失败 ${failCount} 条。`
  );
}

main().catch((e) => {
  console.error('[cf-upload] 未处理异常:', e);
  process.exit(1);
});


