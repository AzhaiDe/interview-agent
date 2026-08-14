# PDF 上传卡住问题修复说明

## 问题描述

上传 PDF 简历后，系统一直显示"上传中"，近 10 分钟无响应。

## 根本原因

**OCR 处理没有超时机制**，导致扫描型 PDF 触发 OCR 后无限等待。

### 问题流程

1. 用户上传 PDF（可能是扫描件或图片型 PDF）
2. `extractText()` 调用 `pdf-parse` 提取文本
3. 如果提取的文本 < 20 字符，判定为扫描型 PDF
4. 触发 `ocrPdf()` 使用 Tesseract.js 进行 OCR
5. **OCR 每页需要 2-5 分钟**，最多支持 8 页
6. **总计可能需要 16-40 分钟**，且没有超时机制
7. 请求一直等待，前端显示"上传中"

### 为什么 OCR 这么慢？

- Tesseract.js 是纯 JavaScript 实现的 OCR 引擎
- 在云服务器上，没有 GPU 加速，纯 CPU 计算
- 中文 OCR（`chi_sim+eng`）比英文慢 3-5 倍
- 每页渲染为图片 + OCR 识别 = 2-5 分钟/页

## 修复方案

### 1. 添加超时机制

**文件**: `src/resume.ts`

```typescript
// 添加超时包装器
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ResumeTimeoutError(`${operation} 超时（${timeoutMs}ms），请稍后重试或上传文本型 PDF`));
    }, timeoutMs);

    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

// PDF 解析超时：30 秒
const result = await withTimeout(pdf(buffer), 30_000, "PDF 解析");

// OCR 超时：5 分钟
return withTimeout(ocrProcess(), 300_000, "OCR 识别");
```

### 2. 添加错误处理

**文件**: `src/server.ts`

```typescript
try {
  text = await extractText(data.filename, buffer);
} catch (error) {
  const statusCode = (error as any).statusCode || 500;
  const message = error instanceof Error ? error.message : String(error);
  request.log.error({ error: message, filename: data.filename }, "Failed to extract text from resume");
  return reply.code(statusCode).send({ error: message });
}
```

### 3. 超时时间配置

| 操作 | 超时时间 | 说明 |
|------|---------|------|
| PDF 解析 | 30 秒 | 普通 PDF 应该在几秒内完成 |
| OCR 识别 | 5 分钟 | 考虑多页扫描 PDF |
| 总计 | ~5.5 分钟 | 超时后会返回错误 |

## 部署步骤

### 1. 重新构建项目

```bash
npm run build
```

### 2. 重启服务

```bash
# 如果使用 PM2
pm2 restart offerpilot

# 如果使用 systemd
sudo systemctl restart offerpilot

# 如果直接运行
# 先停止旧进程，然后
npm start
```

### 3. 验证修复

上传一个扫描型 PDF，应该在 5 分钟内收到错误提示：
```
OCR 识别 超时（300000ms），请稍后重试或上传文本型 PDF
```

## 临时解决方案（立即生效）

如果不想等待部署，可以**禁用 OCR**：

```bash
# 在 .env 文件中添加
OCR_ENABLED=false
```

然后重启服务。这样扫描型 PDF 会直接报错，但不会卡住。

## 长期优化建议

### 1. 异步处理（推荐）

将 PDF 解析和 OCR 移到后台任务：

```typescript
// 上传时立即返回
const taskId = createTask();
void processResumeAsync(taskId, buffer);
return { taskId, status: "processing" };

// 前端轮询任务状态
GET /api/v1/tasks/:taskId
```

**优点**：
- 上传请求秒级返回
- 可以显示进度条
- 不会因为超时失败

### 2. 使用云端 OCR 服务

替换 Tesseract.js 为云端 OCR：

- **阿里云 OCR**：https://www.aliyun.com/product/ai/ocr
- **腾讯云 OCR**：https://cloud.tencent.com/product/ocr
- **百度 AI OCR**：https://ai.baidu.com/tech/ocr

**优点**：
- 速度快（秒级）
- 准确率高
- 不需要本地资源

### 3. 前端优化

添加进度反馈：

```javascript
// 上传时显示进度
const upload = async (file) => {
  const taskId = await uploadFile(file);
  
  // 轮询任务状态
  const poll = setInterval(async () => {
    const task = await fetchTask(taskId);
    updateProgress(task.progress);
    
    if (task.status === 'completed') {
      clearInterval(poll);
      showSuccess();
    } else if (task.status === 'failed') {
      clearInterval(poll);
      showError(task.error);
    }
  }, 2000);
};
```

### 4. PDF 预处理

在上传前检查 PDF 类型：

```javascript
// 前端检查
const checkPdfType = async (file) => {
  const buffer = await file.arrayBuffer();
  const text = await extractTextPreview(buffer);
  
  if (text.length < 50) {
    alert("检测到扫描型 PDF，建议使用文本型 PDF 以获得更好的体验");
  }
};
```

## 监控和告警

添加监控指标：

```typescript
// 记录 PDF 处理时间
const startTime = Date.now();
try {
  text = await extractText(filename, buffer);
  const duration = Date.now() - startTime;
  
  metrics.histogram('pdf_extract_duration', duration);
  metrics.increment('pdf_extract_success');
} catch (error) {
  metrics.increment('pdf_extract_error', { type: error.name });
}
```

## 测试验证

### 测试用例

1. **文本型 PDF**：应该在几秒内完成
2. **扫描型 PDF**：应该在 5 分钟内超时并返回错误
3. **大型 PDF（>8 页）**：应该立即报错"最多支持 8 页"
4. **损坏的 PDF**：应该返回"不是有效 PDF"

### 测试命令

```bash
# 测试正常 PDF
curl -X POST http://localhost:4310/api/resume/analyze \
  -F "file=@normal.pdf"

# 测试扫描型 PDF（应该超时）
curl -X POST http://localhost:4310/api/resume/analyze \
  -F "file=@scanned.pdf"

# 测试大型 PDF（应该立即报错）
curl -X POST http://localhost:4310/api/resume/analyze \
  -F "file=@large.pdf"
```

## 常见问题

### Q: 为什么不禁用 OCR？

A: OCR 对于扫描型简历是必要的。禁用后，扫描型 PDF 会直接报错，但至少不会卡住。

### Q: 能不能提高 OCR 速度？

A: 可以，但需要：
- 使用 GPU 加速（成本高）
- 使用云端 OCR 服务（推荐）
- 优化 Tesseract 配置（效果有限）

### Q: 前端如何区分"上传中"和"处理中"？

A: 建议分两阶段：
1. **上传中**：文件上传到服务器（秒级）
2. **处理中**：PDF 解析和 OCR（可能需要几分钟）

### Q: 如何避免用户上传扫描型 PDF？

A: 可以：
- 在上传前提示"建议使用文本型 PDF"
- 提供 PDF 转换工具链接
- 在前端检测 PDF 类型并警告

## 总结

**问题**：OCR 没有超时机制，导致扫描型 PDF 卡住 10+ 分钟

**修复**：
1. ✅ 添加 30 秒 PDF 解析超时
2. ✅ 添加 5 分钟 OCR 超时
3. ✅ 添加错误处理和用户友好提示

**效果**：
- 上传请求最多等待 5.5 分钟
- 超时后返回清晰的错误信息
- 不会无限卡住

**下一步**：
1. 部署修复到生产环境
2. 考虑实现异步处理（长期优化）
3. 考虑使用云端 OCR 服务（长期优化）
