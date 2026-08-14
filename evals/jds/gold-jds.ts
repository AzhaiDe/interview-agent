/**
 * Gold Dataset: Sample Job Descriptions
 *
 * 10 JDs covering different roles and levels.
 * Used for evaluation per PRD §16.3.
 */

export const goldJDs = [
  {
    id: "jd-001",
    title: "高级 Java 后端工程师",
    level: "Senior",
    jdRaw: `负责核心业务系统设计和开发，要求：
- 5年以上 Java 开发经验
- 精通 Spring Boot、MySQL、Redis
- 有高并发系统设计经验
- 熟悉微服务架构
职责：
- 主导系统架构设计
- 性能优化和故障排查
- 指导初级工程师`,
    mustHave: ["Java", "Spring Boot", "MySQL", "Redis", "高并发"],
    niceToHave: ["Kubernetes", "消息队列"],
  },
  {
    id: "jd-002",
    title: "AI/RAG 工程师",
    level: "Mid",
    jdRaw: `负责 RAG 系统开发和优化，要求：
- 3年以上 Python 开发经验
- 熟悉 LangChain、向量数据库
- 了解大模型应用开发
- 有检索优化经验
职责：
- 设计和优化 RAG pipeline
- 提升检索准确率和响应速度
- 与产品团队合作理解需求`,
    mustHave: ["Python", "LangChain", "向量数据库", "RAG"],
    niceToHave: ["TensorFlow", "PyTorch"],
  },
  {
    id: "jd-003",
    title: "前端工程师",
    level: "Mid",
    jdRaw: `负责前端系统开发和维护，要求：
- 3年以上前端开发经验
- 精通 React、TypeScript
- 熟悉前端性能优化
- 有良好的代码规范
职责：
- 开发核心业务页面
- 性能优化和用户体验提升
- 参与技术选型和架构设计`,
    mustHave: ["React", "TypeScript", "性能优化"],
    niceToHave: ["Next.js", "Webpack"],
  },
  {
    id: "jd-004",
    title: "Go 后端工程师",
    level: "Senior",
    jdRaw: `负责分布式系统开发，要求：
- 5年以上 Go 开发经验
- 精通分布式系统设计
- 熟悉 etcd、gRPC、Kubernetes
- 有高并发系统经验
职责：
- 设计分布式系统架构
- 核心模块开发
- 系统性能优化`,
    mustHave: ["Go", "分布式系统", "etcd", "gRPC"],
    niceToHave: ["Kubernetes", "微服务"],
  },
  {
    id: "jd-005",
    title: "算法工程师",
    level: "Mid",
    jdRaw: `负责推荐系统开发和优化，要求：
- 3年以上算法开发经验
- 精通 Python、TensorFlow/PyTorch
- 熟悉推荐算法（协同过滤、深度学习）
- 有 A/B 测试经验
职责：
- 推荐算法研发和优化
- 特征工程和模型调优
- 算法效果评估`,
    mustHave: ["Python", "TensorFlow", "推荐算法", "A/B 测试"],
    niceToHave: ["Spark", "大数据"],
  },
  {
    id: "jd-006",
    title: "Java 架构师",
    level: "Staff",
    jdRaw: `负责系统架构设计和技术决策，要求：
- 8年以上 Java 开发经验
- 精通微服务架构设计
- 有高并发、高可用系统经验
- 熟悉 Spring Cloud、Dubbo
职责：
- 系统架构设计和技术选型
- 核心难题攻关
- 技术团队建设和指导`,
    mustHave: ["Java", "微服务", "高并发", "架构设计"],
    niceToHave: ["Spring Cloud", "Dubbo", "Kubernetes"],
  },
  {
    id: "jd-007",
    title: "大数据工程师",
    level: "Mid",
    jdRaw: `负责大数据平台开发，要求：
- 3年以上大数据开发经验
- 精通 Flink、Kafka、Hadoop
- 熟悉实时数据处理
- 有性能优化经验
职责：
- 大数据平台开发和维护
- 实时数据处理 pipeline 设计
- 性能优化和故障排查`,
    mustHave: ["Flink", "Kafka", "Hadoop", "实时处理"],
    niceToHave: ["Spark", "Hive"],
  },
  {
    id: "jd-008",
    title: "移动端工程师",
    level: "Mid",
    jdRaw: `负责移动端应用开发，要求：
- 3年以上移动端开发经验
- 精通 Flutter 或 React Native
- 熟悉 WebSocket、离线存储
- 有性能优化经验
职责：
- 移动端应用开发
- 性能优化和用户体验提升
- 跨平台技术方案设计`,
    mustHave: ["Flutter", "WebSocket", "性能优化"],
    niceToHave: ["React Native", "iOS/Android"],
  },
  {
    id: "jd-009",
    title: "运维工程师",
    level: "Mid",
    jdRaw: `负责运维平台建设，要求：
- 3年以上运维经验
- 精通 Prometheus、Grafana
- 熟悉 Kubernetes、Docker
- 有自动化运维经验
职责：
- 监控系统建设和维护
- 告警规则配置和优化
- 自动化运维脚本开发`,
    mustHave: ["Prometheus", "Grafana", "Kubernetes"],
    niceToHave: ["Docker", "Ansible"],
  },
  {
    id: "jd-010",
    title: "安全工程师",
    level: "Mid",
    jdRaw: `负责安全工具开发和维护，要求：
- 3年以上安全工程经验
- 精通 Python、Web 安全
- 熟悉常见漏洞（SQL 注入、XSS）
- 有安全工具开发经验
职责：
- 安全扫描工具开发
- 漏洞检测和防护
- 安全自动化建设`,
    mustHave: ["Python", "Web 安全", "漏洞检测"],
    niceToHave: ["渗透测试", "OWASP"],
  },
];
