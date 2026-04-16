export interface SkuSpecDictionaryType {
  code: string
  name: string
  usage: string
}

export interface SkuSpecSegment {
  code: string
  meaning: string
}

export interface SkuSpecDictionaryItem {
  code: string
  name: string
}

export interface SkuSpecDictionarySection {
  title: string
  dictType: string
  dictTypeName: string
  segment: string
  items: SkuSpecDictionaryItem[]
}

export interface SkuSpecRuleSection {
  title: string
  items: string[]
}

export interface SkuSpecCard {
  title: string
  description: string
}

export interface SkuSpecSystemChangeSection {
  area: string
  items: {
    file: string
    description: string
  }[]
}

export const SKU_SPEC_FORMAT = 'SKU-品类码-工艺码-规格码-包装码-属性码-流水号'
export const SKU_SPEC_EXAMPLE = 'SKU-UHT-UHT-250ML-12BX-PLN-001'
export const SKU_SPEC_EXECUTION_SUMMARY = '新增 SKU 统一执行七段式标准编码；历史 SKU 先保留旧码并建立“旧码 -> 新标准码”映射，通过质量检查和逐条应用逐步收敛。'

export const skuSpecImplementedItems = [
  'SKU 编码字典已接入系统字典中心，覆盖品类码、工艺码、包装码、属性码。',
  '新增 SKU 和导入新增行执行七段式标准编码校验。',
  '存量 SKU 可继续维护，并通过映射表记录目标标准码。',
  '主数据治理平台可执行 SKU 格式质量检查，输出待整改问题。',
  'SKU 页面支持查看映射、导出映射、逐条应用标准码。'
]

export const skuSpecSegments: SkuSpecSegment[] = [
  { code: 'SKU', meaning: '固定前缀' },
  { code: 'UHT', meaning: '品类码，例如常温液奶' },
  { code: 'UHT', meaning: '工艺码，例如超高温灭菌' },
  { code: '250ML', meaning: '规格码，必须带单位' },
  { code: '12BX', meaning: '包装码，两位数量 + 包装类型' },
  { code: 'PLN', meaning: '属性码，保留一个主差异属性' },
  { code: '001', meaning: '三位流水号' }
]

export const skuSpecDictionaryTypes: SkuSpecDictionaryType[] = [
  { code: 'sku_category_code', name: 'SKU品类码', usage: 'SKU 第2段' },
  { code: 'sku_process_code', name: 'SKU工艺码', usage: 'SKU 第3段' },
  { code: 'sku_pack_code', name: 'SKU包装码', usage: 'SKU 第5段' },
  { code: 'sku_attr_code', name: 'SKU属性码', usage: 'SKU 第6段' }
]

export const skuSpecDictionarySections: SkuSpecDictionarySection[] = [
  {
    title: '1. SKU品类码',
    dictType: 'sku_category_code',
    dictTypeName: 'SKU品类码',
    segment: 'SKU 第2段',
    items: [
      { code: 'UHT', name: '常温液奶' },
      { code: 'FRM', name: '巴氏鲜奶' },
      { code: 'YOG', name: '酸奶' },
      { code: 'DRK', name: '乳饮品' },
      { code: 'PWD', name: '奶粉' },
      { code: 'CHS', name: '芝士' },
      { code: 'RGD', name: '特殊地域乳制品' }
    ]
  },
  {
    title: '2. SKU工艺码',
    dictType: 'sku_process_code',
    dictTypeName: 'SKU工艺码',
    segment: 'SKU 第3段',
    items: [
      { code: 'UHT', name: '超高温灭菌' },
      { code: 'PAS', name: '巴氏杀菌' },
      { code: 'CHL', name: '冷藏低温' },
      { code: 'RTD', name: '即饮型' },
      { code: 'GRK', name: '希腊型' },
      { code: 'PWD', name: '粉状' },
      { code: 'CRM', name: '奶油型' },
      { code: 'MOZ', name: '马苏里拉型' },
      { code: 'SLC', name: '切片型' },
      { code: 'GHE', name: '澄清黄油/酥油型' },
      { code: 'FER', name: '发酵乳型' },
      { code: 'RAW', name: '特色乳源加工型' }
    ]
  },
  {
    title: '3. SKU包装码',
    dictType: 'sku_pack_code',
    dictTypeName: 'SKU包装码',
    segment: 'SKU 第5段',
    items: [
      { code: '01BT', name: '单瓶' },
      { code: '01BX', name: '单盒' },
      { code: '01BG', name: '单袋' },
      { code: '01CN', name: '单罐' },
      { code: '10CP', name: '10杯装' },
      { code: '10BX', name: '10盒装' },
      { code: '12BX', name: '12盒装' },
      { code: '12CP', name: '12杯装' },
      { code: '24BX', name: '24盒装' },
      { code: '30BT', name: '30瓶装' },
      { code: '12BT', name: '12瓶装' }
    ]
  },
  {
    title: '4. SKU属性码',
    dictType: 'sku_attr_code',
    dictTypeName: 'SKU属性码',
    segment: 'SKU 第6段',
    items: [
      { code: 'PLN', name: '基础款/原味' },
      { code: 'HCL', name: '高钙' },
      { code: 'A2N', name: 'A2' },
      { code: 'ORG', name: '有机' },
      { code: 'ADT', name: '成人' },
      { code: 'CHD', name: '儿童' },
      { code: 'MID', name: '中老年' },
      { code: 'STR', name: '草莓味' },
      { code: 'BLU', name: '蓝莓味' },
      { code: 'MNG', name: '芒果味' },
      { code: 'ZSG', name: '零蔗糖' },
      { code: 'HPR', name: '高蛋白' },
      { code: 'PRB', name: '益生菌' },
      { code: 'YAK', name: '牦牛奶源' },
      { code: 'SAS', name: '南亚风味' },
      { code: 'KEF', name: '克菲尔' },
      { code: 'EUR', name: '欧美调味' },
      { code: 'CAM', name: '骆驼奶源' },
      { code: 'MAR', name: '马奶奶源' },
      { code: 'DNK', name: '驴奶奶源' }
    ]
  }
]

export const skuSpecValidationSections: SkuSpecRuleSection[] = [
  {
    title: '新增 SKU',
    items: [
      'SKU编码、SKU名称必填。',
      'SKU编码必须符合七段式格式。',
      '品类码、工艺码、包装码、属性码必须存在于字典中。',
      '规格码必须带单位，只允许 ML、L、G、KG。',
      '流水号必须是三位数字。',
      'SKU编码必须唯一。'
    ]
  },
  {
    title: '存量 SKU',
    items: [
      '历史编码可继续编辑业务属性。',
      '系统为历史编码生成目标标准码映射。',
      '切码前先通过质量检查和业务引用确认。',
      '切码后同步更新关系表、订单行、库存等引用。'
    ]
  },
  {
    title: 'Excel 导入',
    items: [
      '新增 SKU 必须符合七段式标准编码。',
      '已存在的历史 SKU 允许按原编码覆盖更新。',
      '缺少 SKU编码 或 SKU名称 的行会报错。',
      '不符合规则的新编码会被拦截。'
    ]
  }
]

export const skuSpecCompatibilityPolicy = [
  '新建必须按新规则。',
  '老数据允许维护，但会进入格式质量检查问题池。',
  '老数据通过映射表逐条确认和应用。',
  '不再新增旧风格 SKU。'
]

export const skuSpecTemplateSheets: SkuSpecCard[] = [
  {
    title: 'SKU导入模板',
    description: '用于正式填写导入数据，示例编码已改为标准七段式。'
  },
  {
    title: '编码规则',
    description: '说明标准格式、字段含义、规格单位、包装码写法和历史编码兼容原则。'
  },
  {
    title: '编码字典',
    description: '列出系统当前品类码、工艺码、包装码、属性码，减少人工记忆成本。'
  },
  {
    title: '旧码映射',
    description: '用于承接存量 SKU，记录旧编码、目标标准编码、确认状态和切换进度。'
  }
]

export const skuSpecSystemChanges: SkuSpecSystemChangeSection[] = [
  {
    area: '后端',
    items: [
      { file: 'skuRules.js', description: '统一维护 SKU 字典、格式规则、示例数据、校验逻辑和存量标准码推导。' },
      { file: 'localDb.js', description: '将 SKU 编码字典接入系统默认字典中心。' },
      { file: 'index.js', description: '提供 SKU 规则配置、映射表生成、映射应用、导入校验接口。' },
      { file: 'mdmGovernance.js', description: '提供默认 SKU 格式质量规则，并支持按规则编码执行专项检查。' }
    ]
  },
  {
    area: '前端',
    items: [
      { file: 'MdmSkuList.vue', description: '补齐新增校验、规范说明、旧码映射表、导出和逐条切换入口。' },
      { file: 'MdmGovernanceCenter.vue', description: '补齐 SKU 格式专项质量检查入口和检查结果反馈。' }
    ]
  }
]

export const skuSpecUsageGuides: SkuSpecRuleSection[] = [
  {
    title: '主数据治理专员',
    items: [
      '在 SKU 页面生成旧码映射，导出后给业务确认。',
      '在治理平台执行 SKU 格式专项检查，跟踪未达标编码。'
    ]
  },
  {
    title: '主数据录入人员',
    items: [
      '新增 SKU 按七段式填写。',
      '历史 SKU 不直接手改编码，通过映射应用完成切换。'
    ]
  },
  {
    title: '业务负责人',
    items: [
      '确认旧码与新标准码是否一一对应。',
      '按低风险、低引用量的 SKU 分批切换。'
    ]
  },
  {
    title: '开发和测试人员',
    items: [
      '以“新编码强校验、历史编码映射收敛、引用同步更新”为验收口径。'
    ]
  }
]

export const skuSpecNextSteps = [
  '第一批先处理无在途订单、低库存或演示类 SKU。',
  '第二批处理常温液奶和酸奶等高频 SKU，切换前确认订单和库存引用。',
  '第三批处理奶粉、芝士等低频 SKU，并复跑质量检查。',
  '所有存量 SKU 完成切换后，将历史兼容策略改为只读归档。'
]
