/**
 * Gold Dataset: Sample Resumes
 *
 * 10 diverse resumes covering different roles, experience levels, and evidence quality.
 * Used for evaluation per PRD §16.3.
 */

export const goldResumes = [
  {
    id: "resume-001",
    rawText: `项目：订单系统。负责接口幂等、Redis 缓存和 MySQL 索引优化，P99 从 120ms 降到 80ms。
技术栈：Java, Spring Boot, Redis, MySQL
职责：独立完成接口幂等设计和缓存层优化，通过压测验证效果。`,
    targetRole: "Java 后端工程师",
    skills: ["Java", "Redis", "MySQL", "Spring Boot"],
    experiences: [
      {
        title: "订单系统",
        type: "project",
        summary: "订单系统优化",
        bullets: ["接口幂等设计", "Redis 缓存优化", "MySQL 索引优化"],
        technologies: ["Java", "Redis", "MySQL"],
        claims: ["P99 从 120ms 降到 80ms"],
        highlights: ["P99 80ms"],
        risks: [],
      },
    ],
  },
  {
    id: "resume-002",
    rawText: `项目：RAG 知识库系统。设计并实现向量检索 + 重排序 pipeline，检索准确率从 65% 提升到 89%。
技术栈：Python, LangChain, Milvus, FastAPI
职责：独立负责检索模块设计和优化，包括向量索引选型、重排序算法实现。`,
    targetRole: "AI/RAG 工程师",
    skills: ["Python", "LangChain", "Milvus", "RAG"],
    experiences: [
      {
        title: "RAG 知识库系统",
        type: "project",
        summary: "RAG 检索优化",
        bullets: ["向量检索 pipeline", "重排序算法", "准确率优化"],
        technologies: ["Python", "LangChain", "Milvus"],
        claims: ["检索准确率从 65% 提升到 89%"],
        highlights: ["准确率 89%"],
        risks: [],
      },
    ],
  },
  {
    id: "resume-003",
    rawText: `项目：电商前端重构。使用 React + TypeScript 重构核心页面，首屏加载时间从 3.2s 降到 1.1s。
技术栈：React, TypeScript, Webpack, CSS Modules
职责：负责技术选型、组件设计和性能优化，指导 2 名初级工程师。`,
    targetRole: "前端工程师",
    skills: ["React", "TypeScript", "Webpack", "性能优化"],
    experiences: [
      {
        title: "电商前端重构",
        type: "project",
        summary: "前端技术栈升级",
        bullets: ["React + TypeScript 重构", "性能优化", "团队指导"],
        technologies: ["React", "TypeScript", "Webpack"],
        claims: ["首屏加载从 3.2s 降到 1.1s"],
        highlights: ["首屏 1.1s"],
        risks: [],
      },
    ],
  },
  {
    id: "resume-004",
    rawText: `项目：分布式任务调度系统。基于 Go + etcd 实现分布式任务调度，支持百万级任务并发。
技术栈：Go, etcd, gRPC, Kubernetes
职责：独立设计任务分发和故障恢复机制，处理节点故障和数据一致性问题。`,
    targetRole: "Go 后端工程师",
    skills: ["Go", "etcd", "gRPC", "Kubernetes"],
    experiences: [
      {
        title: "分布式任务调度系统",
        type: "project",
        summary: "分布式调度设计",
        bullets: ["任务分发机制", "故障恢复", "数据一致性"],
        technologies: ["Go", "etcd", "gRPC"],
        claims: ["支持百万级任务并发"],
        highlights: ["百万并发"],
        risks: [],
      },
    ],
  },
  {
    id: "resume-005",
    rawText: `项目：推荐系统优化。优化协同过滤算法，CTR 从 3.2% 提升到 4.8%。
技术栈：Python, TensorFlow, Spark, Hadoop
职责：负责特征工程和模型调优，设计 A/B 测试方案。`,
    targetRole: "算法工程师",
    skills: ["Python", "TensorFlow", "Spark", "推荐系统"],
    experiences: [
      {
        title: "推荐系统优化",
        type: "project",
        summary: "推荐算法优化",
        bullets: ["特征工程", "模型调优", "A/B 测试"],
        technologies: ["Python", "TensorFlow", "Spark"],
        claims: ["CTR 从 3.2% 提升到 4.8%"],
        highlights: ["CTR 4.8%"],
        risks: [],
      },
    ],
  },
  {
    id: "resume-006",
    rawText: `项目：微服务网关。设计并实现 API 网关，支持限流、熔断、灰度发布。
技术栈：Java, Spring Cloud, Nginx, Redis
职责：负责网关核心模块设计，处理高并发场景下的性能优化。`,
    targetRole: "Java 后端工程师",
    skills: ["Java", "Spring Cloud", "Nginx", "Redis"],
    experiences: [
      {
        title: "微服务网关",
        type: "project",
        summary: "API 网关设计",
        bullets: ["限流熔断", "灰度发布", "性能优化"],
        technologies: ["Java", "Spring Cloud", "Nginx"],
        claims: ["支持高并发场景"],
        highlights: ["高并发"],
        risks: [],
      },
    ],
  },
  {
    id: "resume-007",
    rawText: `项目：实时数据分析平台。基于 Flink + Kafka 构建实时数据处理 pipeline，日处理数据量 10TB。
技术栈：Flink, Kafka, Hadoop, Java
职责：独立设计数据流处理和状态管理方案，优化吞吐量和延迟。`,
    targetRole: "大数据工程师",
    skills: ["Flink", "Kafka", "Hadoop", "Java"],
    experiences: [
      {
        title: "实时数据分析平台",
        type: "project",
        summary: "实时数据处理",
        bullets: ["数据流处理", "状态管理", "性能优化"],
        technologies: ["Flink", "Kafka", "Hadoop"],
        claims: ["日处理数据量 10TB"],
        highlights: ["10TB 日处理"],
        risks: [],
      },
    ],
  },
  {
    id: "resume-008",
    rawText: `项目：移动端 IM 应用。使用 Flutter 开发跨平台 IM 应用，支持万人群聊。
技术栈：Flutter, Dart, WebSocket, Firebase
职责：负责消息同步和离线推送机制设计，优化弱网环境下的用户体验。`,
    targetRole: "移动端工程师",
    skills: ["Flutter", "Dart", "WebSocket", "Firebase"],
    experiences: [
      {
        title: "移动端 IM 应用",
        type: "project",
        summary: "跨平台 IM 开发",
        bullets: ["消息同步", "离线推送", "弱网优化"],
        technologies: ["Flutter", "Dart", "WebSocket"],
        claims: ["支持万人群聊"],
        highlights: ["万人群聊"],
        risks: [],
      },
    ],
  },
  {
    id: "resume-009",
    rawText: `项目：云原生监控平台。基于 Prometheus + Grafana 构建监控系统，覆盖 500+ 服务。
技术栈：Prometheus, Grafana, Kubernetes, Go
职责：负责监控指标设计和告警规则配置，编写自动化运维脚本。`,
    targetRole: "运维工程师",
    skills: ["Prometheus", "Grafana", "Kubernetes", "Go"],
    experiences: [
      {
        title: "云原生监控平台",
        type: "project",
        summary: "监控系统建设",
        bullets: ["监控指标设计", "告警规则", "自动化运维"],
        technologies: ["Prometheus", "Grafana", "Kubernetes"],
        claims: ["覆盖 500+ 服务"],
        highlights: ["500+ 服务"],
        risks: [],
      },
    ],
  },
  {
    id: "resume-010",
    rawText: `项目：安全扫描工具。开发 Web 应用安全扫描器，检测 SQL 注入、XSS 等漏洞。
技术栈：Python, Flask, Selenium, OWASP
职责：独立实现漏洞检测引擎，设计插件化架构支持新漏洞扩展。`,
    targetRole: "安全工程师",
    skills: ["Python", "Flask", "Selenium", "OWASP"],
    experiences: [
      {
        title: "安全扫描工具",
        type: "project",
        summary: "安全扫描器开发",
        bullets: ["漏洞检测引擎", "插件化架构", "SQL 注入检测"],
        technologies: ["Python", "Flask", "Selenium"],
        claims: ["检测 SQL 注入、XSS 等漏洞"],
        highlights: ["漏洞检测"],
        risks: [],
      },
    ],
  },
];
