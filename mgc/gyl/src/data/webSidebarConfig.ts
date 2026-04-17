export interface SidebarMenuItem {
  type: 'item'
  id: string
  label: string
  icon: string
  path: string
  requiresSuperAdmin?: boolean
}

export interface SidebarMenuGroup {
  type: 'group'
  id: string
  title: string
  icon: string
  defaultOpen?: boolean
  requiresSuperAdmin?: boolean
  children: SidebarMenuItem[]
}

export interface SidebarSection {
  id: string
  title: string
  icon: string
  defaultOpen?: boolean
  requiresSuperAdmin?: boolean
  children: Array<SidebarMenuItem | SidebarMenuGroup>
}

export const SIDEBAR_ROOT_ONLY_ONE_OPEN = true

export const webSidebarConfig: SidebarSection[] = [
  {
    id: 'workbench',
    title: '工作台',
    icon: 'DataBoard',
    defaultOpen: true,
    children: [
      {
        type: 'item',
        id: 'workflow-center',
        label: '流程协同与待办中心',
        icon: 'Bell',
        path: '/workflow-center'
      },
      {
        type: 'item',
        id: 'management-cockpit',
        label: '经营分析与管理驾驶舱',
        icon: 'DataBoard',
        path: '/management-cockpit'
      }
    ]
  },
  {
    id: 'business-ops',
    title: '业务运营',
    icon: 'Box',
    defaultOpen: false,
    children: [
      {
        type: 'item',
        id: 'intelligent',
        label: '智能订购中心',
        icon: 'Cpu',
        path: '/intelligent'
      },
      {
        type: 'item',
        id: 'intelligent-closed-loop',
        label: '订单闭环中心',
        icon: 'Finished',
        path: '/intelligent-closed-loop'
      },
      {
        type: 'item',
        id: 'inventory-ops',
        label: '库存与仓配运营中心',
        icon: 'Box',
        path: '/inventory-ops'
      },
      {
        type: 'item',
        id: 'channel-dealer-ops',
        label: '渠道与经销商经营中心',
        icon: 'DataLine',
        path: '/channel-dealer-ops'
      },
      {
        type: 'item',
        id: 'pasture',
        label: '牧场与奶源运营中心',
        icon: 'Van',
        path: '/pasture'
      }
    ]
  },
  {
    id: 'mdm',
    title: '主数据管理（MDM）',
    icon: 'Goods',
    defaultOpen: false,
    requiresSuperAdmin: true,
    children: [
      {
        type: 'group',
        id: 'mdm-product',
        title: '商品管理',
        icon: 'Goods',
        defaultOpen: true,
        children: [
          { type: 'item', id: 'mdm-sku', label: 'SKU管理', icon: 'Goods', path: '/mdm/sku', requiresSuperAdmin: true },
          { type: 'item', id: 'mdm-spu', label: '标准商品SPU', icon: 'GoodsFilled', path: '/mdm/spu', requiresSuperAdmin: true },
          { type: 'item', id: 'mdm-category', label: '品类管理', icon: 'List', path: '/mdm/category', requiresSuperAdmin: true }
        ]
      },
      {
        type: 'group',
        id: 'mdm-warehouse',
        title: '仓库管理',
        icon: 'HomeFilled',
        defaultOpen: false,
        children: [
          { type: 'item', id: 'mdm-warehouse-list', label: '仓库管理', icon: 'HomeFilled', path: '/mdm/warehouse', requiresSuperAdmin: true },
          { type: 'item', id: 'mdm-factory', label: '工厂管理', icon: 'SetUp', path: '/mdm/factory', requiresSuperAdmin: true }
        ]
      },
      {
        type: 'group',
        id: 'mdm-channel',
        title: '渠道管理',
        icon: 'DataAnalysis',
        defaultOpen: false,
        children: [
          { type: 'item', id: 'mdm-channel-tree', label: '渠道管理', icon: 'DataAnalysis', path: '/mdm/channel', requiresSuperAdmin: true },
          { type: 'item', id: 'mdm-reseller', label: '经销商管理', icon: 'UserFilled', path: '/mdm/reseller', requiresSuperAdmin: true }
        ]
      },
      {
        type: 'group',
        id: 'mdm-org-calendar',
        title: '组织与日历',
        icon: 'OfficeBuilding',
        defaultOpen: false,
        children: [
          { type: 'item', id: 'mdm-org', label: '组织机构', icon: 'OfficeBuilding', path: '/mdm/org', requiresSuperAdmin: true },
          { type: 'item', id: 'mdm-calendar', label: '业务日历', icon: 'Calendar', path: '/mdm/calendar', requiresSuperAdmin: true }
        ]
      },
      {
        type: 'group',
        id: 'mdm-relation',
        title: '关系配置',
        icon: 'Connection',
        defaultOpen: false,
        children: [
          { type: 'item', id: 'mdm-rltn-warehouse-sku', label: '仓库-SKU关系', icon: 'Connection', path: '/mdm/rltn/warehouse-sku', requiresSuperAdmin: true },
          { type: 'item', id: 'mdm-reseller-relation', label: 'SKU-经销关系', icon: 'Connection', path: '/mdm/reseller-relation', requiresSuperAdmin: true },
          { type: 'item', id: 'mdm-rltn-org-reseller', label: '组织-经销关系', icon: 'Connection', path: '/mdm/rltn/org-reseller', requiresSuperAdmin: true },
          { type: 'item', id: 'mdm-rltn-product-sku', label: '产品-SKU转换关系', icon: 'Connection', path: '/mdm/rltn/product-sku', requiresSuperAdmin: true }
        ]
      },
      {
        type: 'group',
        id: 'mdm-governance',
        title: '治理平台',
        icon: 'DataBoard',
        defaultOpen: false,
        children: [
          { type: 'item', id: 'mdm-governance-center', label: '主数据治理平台', icon: 'DataBoard', path: '/mdm/governance', requiresSuperAdmin: true }
        ]
      }
    ]
  },
  {
    id: 'permission-system',
    title: '权限与系统',
    icon: 'Setting',
    defaultOpen: false,
    children: [
      {
        type: 'group',
        id: 'org-permission',
        title: '组织权限',
        icon: 'Lock',
        defaultOpen: true,
        children: [
          { type: 'item', id: 'department', label: '部门管理', icon: 'OfficeBuilding', path: '/department' },
          { type: 'item', id: 'user', label: '用户管理', icon: 'User', path: '/user' },
          { type: 'item', id: 'role', label: '角色管理', icon: 'Key', path: '/role' },
          { type: 'item', id: 'post', label: '岗位管理', icon: 'Stamp', path: '/post' },
          { type: 'item', id: 'permission', label: '权限管理', icon: 'Lock', path: '/permission' },
          { type: 'item', id: 'fine-permission', label: '权限精细化控制', icon: 'Key', path: '/platform/fine-permission' }
        ]
      },
      {
        type: 'group',
        id: 'sys-ops',
        title: '系统配置与运维',
        icon: 'Monitor',
        defaultOpen: false,
        children: [
          { type: 'item', id: 'config-center', label: '系统配置中心', icon: 'Setting', path: '/platform/config-center' },
          { type: 'item', id: 'health-view', label: '系统健康与运维视图', icon: 'Monitor', path: '/platform/health-view' },
          { type: 'item', id: 'monitor', label: '接口与任务监控', icon: 'DataAnalysis', path: '/platform/monitor' },
          { type: 'item', id: 'archive-strategy', label: '数据归档策略', icon: 'FolderOpened', path: '/platform/archive-strategy' }
        ]
      },
      {
        type: 'group',
        id: 'security-audit',
        title: '安全与审计',
        icon: 'Document',
        defaultOpen: false,
        children: [
          { type: 'item', id: 'security-center', label: '登录日志与安全中心', icon: 'Lock', path: '/platform/security-center' },
          { type: 'item', id: 'operation-log', label: '操作日志', icon: 'Document', path: '/operation-log' },
          { type: 'item', id: 'audit-log', label: '审计日志查询页', icon: 'Document', path: '/platform/audit-log' }
        ]
      },
      {
        type: 'group',
        id: 'platform-tools',
        title: '平台工具',
        icon: 'CollectionTag',
        defaultOpen: false,
        children: [
          { type: 'item', id: 'dict-center', label: '字典中心', icon: 'CollectionTag', path: '/dict-center' },
          { type: 'item', id: 'import-task', label: '导入任务', icon: 'UploadFilled', path: '/import-task' },
          { type: 'item', id: 'export-task', label: '导出任务', icon: 'Download', path: '/export-task' }
        ]
      }
    ]
  }
]
