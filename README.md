# OpenDance

OpenDance 是一套可自托管的街舞动作库与练习记录。可以通过风格、难度和示范筛选动作，按拍数或时间练习。访客数据留在当前浏览器，受邀用户可以通过 Passkey 登录同步。

## 开发

需要 Node.js 22.16 或更新的版本。

```sh
npm ci
npm run dev
npm run invite
```

访问 `http://localhost:5173`。邀请链接由最后一条命令生成，有效期七天，每条只能完成一次注册。

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

## 自托管

```sh
docker compose up --build -d
docker compose exec app node server/invite.mjs
```

默认监听 `127.0.0.1:5173`。线上把 `.env` 中的 `PUBLIC_ORIGIN` 设为 `https://dance.world.je`，将该域名指向部署入口，在已有 HTTPS 反向代理中把此域名的全部路径转发到 Compose 暴露的端口。保留同一个域名作为 Passkey 的注册与登录入口。可通过 `/api/health` 检查实例。配置端口后，本地测试时的 `PUBLIC_ORIGIN` 也须匹配浏览器地址。

### 备份与恢复

先停止应用，再复制整个数据目录。恢复时同样保持应用停止，避免 SQLite 的数据库和 WAL 文件来自不同时间点。下面使用 Compose 默认卷名，若自定义 Compose 项目名，应使用实际卷名。

```sh
docker compose stop app
docker run --rm -v opendance_dance_data:/source:ro -v "$PWD:/backup" node:22-bookworm-slim \
  tar -C /source -czf /backup/opendance-data.tar.gz .
docker compose up -d
```

从备份恢复前保存现有数据。将备份放在项目目录，然后执行以下命令。

```sh
docker compose stop app
docker run --rm -v opendance_dance_data:/target -v "$PWD:/backup:ro" node:22-bookworm-slim \
  sh -c 'find /target -mindepth 1 -delete && tar -C /target -xzf /backup/opendance-data.tar.gz && chown -R node:node /target'
docker compose up -d
```

## 补充舞步示范

[动作目录](catalogue/moves.json) 中每条记录都有独立 ID。只有文字的条目可以查看步骤和加入计划。要上传制作好的 GIF 或视频，按以下步骤提交更新。

1. 选择原片中人物全身清楚入镜的一段。把文件转成 H.264 MP4，并从视频抽取封面。
2. 保存为 `public/media/<id>.mp4` 和 `public/media/<id>.webp`。
3. 给对应条目加上 `media` 的作者、来源、许可证、许可链接及改动说明。确认素材有公开发布授权。
4. 运行测试并重建部署。播放器会自动显示该条目的示范。

```sh
ffmpeg -i demonstration.gif -vf 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2' \
  -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart public/media/<id>.mp4
ffmpeg -ss 0.4 -i public/media/<id>.mp4 -frames:v 1 public/media/<id>.webp
```

当前两个舞步视频与封面改编自 LittleT889 的 [Running Man](https://commons.wikimedia.org/wiki/File:Running_Man_Dance.gif) 与 [The Dougie](https://commons.wikimedia.org/wiki/File:The_Dougie_(animated).gif)，均依 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 发布。源 GIF 已转码并抽帧制作封面。
