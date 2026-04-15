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
export const SKU_SPEC_EXECUTION_SUMMARY = '从现在开始，系统新增 SKU 统一按 SKU-品类码-工艺码-规格码-包装码-属性码-流水号 七段式规则执行；系统已内置编码字典、后端校验和导入模板说明，历史 SKU 允许维护但不允许再按旧风格新增。'

export const skuSpecImplementedItems = [
  '在系统字典中心落地了 SKU 编码字典',
  '在后端新增了 SKU 七段式格式校验',
  '在导入入口增加了 SKU 编码校验和兼容策略',
  '在前端导入模板中补充了规则说明和字典页'
]

export const skuSpecSegments: SkuSpecSegment[] = [
  { code: 'SKU', meaning: '固定前缀' },
  { code: 'UHT', meaning: '品类码' },
  { code: 'UHT', meaning: '工艺码' },
  { code: '250ML', meaning: '规格码' },
  { code: '12BX', meaning: '包装码' },
  { code: 'PLN', meaning: '属性码' },
  { code: '001', meaning: '流水号' }
]

export const skuSpecDictionaryTypes: SkuSpecDictionaryType[] = [
  { code: 'sku_category_code', name: 'SKU品类码', usage: 'SKU 第 2 段' },
  { code: 'sku_process_code', name: 'SKU工艺码', usage: 'SKU 第 3 段' },
  { code: 'sku_pack_code', name: 'SKU包装码', usage: 'SKU 第 5 段' },
  { code: 'sku_attr_code', name: 'SKU属性码', usage: 'SKU 第 6 段' }
]

export const skuSpecDictionarySections: SkuSpecDictionarySection[] = [
  {
    title: '1. SKU品类码',
    dictType: 'sku_category_code',
    dictTypeName: 'SKU品类码',
    segment: 'SKU 第 2 段',
    items: [
      { code: 'UHT', name: '常温液奶' },
      { code: 'FRM', name: '巴氏鲜奶' },
      { code: 'YOG', name: '酸奶' },
      { code: 'DRK', name: '乳饮品' },
      { code: 'PWD', name: '奶粉' },
      { code: 'CHS', name: '芝士' }
    ]
  },
  {
    title: '2. SKU工艺码',
    dictType: 'sku_process_code',
    dictTypeName: 'SKU工艺码',
    segment: 'SKU 第 3 段',
    items: [
      { code: 'UHT', name: '超高温灭菌' },
      { code: 'PAS', name: '巴氏杀菌' },
      { code: 'CHL', name: '冷藏低温' },
      { code: 'RTD', name: '即饮型' },
      { code: 'GRK', name: '希腊型' },
      { code: 'PWD', name: '粉状' },
      { code: 'CRM', name: '奶油型' },
      { code: 'MOZ', name: '马苏里拉型' },
      { code: 'SLC', name: '切片型' }
    ]
  },
  {
    title: '3. SKU包装码',
    dictType: 'sku_pack_code',
    dictTypeName: 'SKU包装码',
    segment: 'SKU 第 5 段',
    items: [
      { code: '01BT', name: '单瓶' },
      { code: '01BX', name: '单盒' },
      { code: '01BG', name: '单袋' },
      { code: '01CN', name: '单罐' },
      { code: '10CP', name: '10杯装' },
      { code: '12BX', name: '12盒装' },
      { code: '24BX', name: '24盒装' },
      { code: '30BT', name: '30瓶装' }
    ]
  },
  {
    title: '4. SKU属性码',
    dictType: 'sku_attr_code',
    dictTypeName: 'SKU属性码',
    segment: 'SKU 第 6 段',
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
      { code: 'ZSG', name: '零蔗糖' }
    ]
  }
]

export const skuSpecValidationSections: SkuSpecRuleSection[] = [
  {
    title: '新增 SKU 时',
    items: [
      '必须填写 SKU编码',
      '必须填写 SKU名称',
      'SKU编码 必须符合七段式格式',
      '品类码 必须存在于字典中',
      '工艺码 必须存在于字典中',
      '包装码 必须存在于字典中',
      '属性码 必须存在于字典中',
      '规格码 必须带单位',
      '流水号 必须是 3 位数字',
      'SKU编码 必须唯一'
    ]
  },
  {
    title: '编辑 SKU 时',
    items: [
      '不允许修改已有 SKU编码',
      '允许维护 SKU名称、69码、品类编码、生命周期等信息',
      '历史旧编码可继续维护'
    ]
  },
  {
    title: 'Excel 导入时',
    items: [
      '新增 SKU 必须符合七段式编码',
      '已存在的历史 SKU 允许按原编码覆盖更新',
      '缺少 SKU编码 或 SKU名称 的行会报错',
      '不符合规则的新编码会被拦截'
    ]
  }
]

export const skuSpecCompatibilityPolicy = [
  '新建必须按新规则',
  '老数据允许继续编辑',
  '老数据允许通过导入按旧编码覆盖更新',
  '不允许再新增新的旧风格 SKU'
]

export const skuSpecTemplateSheets: SkuSpecCard[] = [
  {
    title: 'SKU导入模板',
    description: '用于正式填写导入数据，示例编码已经改为标准七段式。'
  },
  {
    title: '编码规则',
    description: '说明标准格式、字段含义、规格单位写法、包装码写法以及历史编码兼容原则。'
  },
  {
    title: '编码字典',
    description: '直接列出系统当前品类码、工艺码、包装码、属性码，减少人工记忆成本。'
  }
]

export const skuSpecSystemChanges: SkuSpecSystemChangeSection[] = [
  {
    area: '后端',
    items: [
      { file: 'skuRules.js', description: '统一维护 SKU 字典、格式规则、示例数据、校验逻辑。' },
      { file: 'localDb.js', description: '把 SKU 编码字典接入系统默认字典中心。' },
      { file: 'index.js', description: '增加 SKU 规则配置接口，补齐新增、编辑、导入校验。' },
      { file: 'mdmGovernance.js', description: '增加默认的 SKU 格式质量规则。' }
    ]
  },
  {
    area: '前端',
    items: [
      { file: 'MdmSkuList.vue', description: '补齐新增页校验、规则提示、模板下载规范、历史编码提示。' }
    ]
  }
]

export const skuSpecUsageGuides: SkuSpecRuleSection[] = [
  {
    title: '字典维护人员',
    items: [
      '可以直接进入字典中心，查看和维护 sku_category_code、sku_process_code、sku_pack_code、sku_attr_code。'
    ]
  },
  {
    title: '主数据录入人员',
    items: [
      '新增 SKU 时必须按照七段式填写。'
    ]
  },
  {
    title: '导入人员',
    items: [
      '必须使用最新版模板导入，不要再使用旧模板。'
    ]
  },
  {
    title: '开发和测试人员',
    items: [
      '可以直接以“新增严格校验、存量兼容更新”作为当前验收口径。'
    ]
  }
]

export const skuSpecNextSteps = [
  '把现有存量 SKU 建立“旧码 -> 新标准码”映射表。',
  '在主数据治理平台里跑一次 SKU 格式质量检查。',
  '逐步把历史 SKU 收敛到标准编码体系。'
]
