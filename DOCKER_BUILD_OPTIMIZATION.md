# Docker 构建优化指南

## 问题诊断

原构建时间: **1100 秒 (~18 分钟)**

### 根本原因

1. **缺少 `.dockerignore` (最严重)**
   - 每次构建传输 373MB 到 Docker daemon
   - 包含 325MB node_modules + 26MB .git
   - 任何文件变动都导致缓存失效

2. **未使用 BuildKit 缓存挂载**
   - npm 包每次重新下载
   - 无法复用已下载的依赖

3. **构建上下文过大**
   - 包含运行时数据 (logs, data)
   - 包含开发工具配置

---

## 优化措施

### 1. 创建 `.dockerignore` 文件

排除不必要的文件:
- node_modules/ (325MB)
- .git/ (26MB)
- logs/, data/ (运行时数据)
- 测试文件和文档

**预期效果**: 构建上下文从 373MB 减少到 ~20MB (94% 减少)

### 2. 使用 BuildKit 缓存挂载

```dockerfile
# npm 包缓存
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

# apk 包缓存
RUN --mount=type=cache,target=/var/cache/apk \
    apk add --no-cache docker-cli
```

**预期效果**:
- 首次构建: npm install ~300 秒
- 后续构建 (依赖未变): ~10 秒 (97% 减少)

### 3. 使用 Alpine 国内镜像源

```dockerfile
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
```

**预期效果**:
- apk add docker-cli: 从 150s → ~5s (97% 减少)

### 4. 优化层顺序

依赖安装层在源码拷贝层之前,确保代码改动不会触发依赖重装。

---

## 部署步骤

### 在服务器上部署

```bash
# 1. 进入项目目录
cd ~/workspace/miniapp_pro_backend/art_backend

# 2. 确保启用 BuildKit (Docker 18.09+)
export DOCKER_BUILDKIT=1

# 3. 构建镜像
docker compose build drawing_app

# 4. 启动服务
docker compose up -d
```

### 首次构建后的预期时间

| 场景 | 原时间 | 优化后 | 提升 |
|------|--------|--------|------|
| **完全重建** (清空缓存) | 1100s | ~200s | 82% ↓ |
| **代码修改** (依赖不变) | 1100s | ~40s | 96% ↓ |
| **依赖修改** | 1100s | ~180s | 84% ↓ |

**优化明细:**
- Context 传输: 373MB → 20MB (减少 150s)
- npm install (缓存): 300s → 10s (减少 290s)
- apk add docker-cli: 150s → 5s (减少 145s)
- TypeScript 编译: ~20s (不变)

---

## 验证构建优化

```bash
# 查看构建时间
time docker compose build drawing_app

# 查看构建缓存使用情况
docker buildx du

# 清空缓存重新测试 (可选)
docker builder prune -af
```

---

## 进一步优化建议 (可选)

### 1. 使用多阶段构建缓存

在 `docker-compose.yml` 中添加:

```yaml
drawing_app:
  build:
    context: .
    dockerfile: Dockerfile
    pull: false
    cache_from:
      - art-backend:latest
```

### 2. 预构建基础镜像 (大型项目)

如果有很多共享依赖,可以创建一个基础镜像:

```dockerfile
# Dockerfile.base
FROM m.daocloud.io/docker.io/library/node:25.8-alpine
RUN npm config set registry https://registry.npmmirror.com
COPY package*.json ./
RUN npm ci
```

然后在主 Dockerfile 中:
```dockerfile
FROM art-backend-base:latest AS builder
```

### 3. CI/CD 环境优化

如果使用 GitHub Actions / GitLab CI:

```yaml
- name: Build Docker image
  env:
    DOCKER_BUILDKIT: 1
  run: |
    docker compose build drawing_app
```

---

## 监控和排查

### 查看各层构建时间

```bash
docker build --progress=plain --no-cache -t art-backend:latest .
```

### 查看镜像大小

```bash
docker images art-backend:latest
```

### 查看 BuildKit 缓存使用量

```bash
docker buildx du
docker system df -v
```

### 清理缓存 (磁盘空间不足时)

```bash
# 只清理 build 缓存
docker builder prune -f

# 清理所有未使用资源
docker system prune -af --volumes
```

---

## 注意事项

1. **首次构建仍需要时间**: BuildKit 缓存需要首次构建后才会生效
2. **网络依赖**: npm 下载速度取决于镜像源和网络状况
3. **磁盘空间**: BuildKit 缓存会占用磁盘空间 (~500MB-2GB)
4. **BuildKit 要求**: Docker 18.09+ 或 Docker Compose v2

---

## 回滚方案

如果遇到问题,可以恢复原配置:

```bash
# 删除 .dockerignore
rm .dockerignore

# 使用 git 恢复 Dockerfile
git checkout Dockerfile

# 不使用 BuildKit 构建
DOCKER_BUILDKIT=0 docker compose build drawing_app
```
