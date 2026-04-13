import { createRouter, createWebHistory } from 'vue-router'
import { useAppStore } from '@/stores/appStore'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            redirect: '/department'
        },
        {
            path: '/login',
            name: 'Login',
            component: () => import('@/views/Login.vue'),
            meta: { title: '系统登录' }
        },
        {
            path: '/department',
            name: 'Department',
            component: () => import('@/views/DepartmentManage.vue'),
            meta: { title: '部门管理', icon: 'OfficeBuilding', permissionPath: '/department' }
        },
        {
            path: '/user',
            name: 'User',
            component: () => import('@/views/UserManage.vue'),
            meta: { title: '用户管理', icon: 'User', permissionPath: '/user' }
        },
        {
            path: '/role',
            name: 'Role',
            component: () => import('@/views/RoleManage.vue'),
            meta: { title: '角色管理', icon: 'Key', permissionPath: '/role' }
        },
        {
            path: '/post',
            name: 'Post',
            component: () => import('@/views/PostManage.vue'),
            meta: { title: '岗位管理', icon: 'Stamp', permissionPath: '/post' }
        },
        {
            path: '/permission',
            name: 'Permission',
            component: () => import('@/views/PermissionManage.vue'),
            meta: { title: '权限管理', icon: 'Lock', permissionPath: '/permission' }
        },
        {
            path: '/dict-center',
            name: 'DictCenter',
            component: () => import('@/views/DictCenter.vue'),
            meta: { title: '字典中心', icon: 'CollectionTag', permissionPath: '/dict-center' }
        },
        {
            path: '/operation-log',
            name: 'OperationLog',
            component: () => import('@/views/OperationLogCenter.vue'),
            meta: { title: '操作日志', icon: 'Document', permissionPath: '/operation-log' }
        },
        {
            path: '/enterprise-platform',
            redirect: '/platform/audit-log'
        },
        {
            path: '/platform/audit-log',
            name: 'PlatformAuditLog',
            component: () => import('@/views/PlatformAuditLogPage.vue'),
            meta: { title: '审计日志查询页', icon: 'Document', permissionPath: '/enterprise-platform' }
        },
        {
            path: '/platform/security-center',
            name: 'PlatformSecurityCenter',
            component: () => import('@/views/PlatformSecurityCenterPage.vue'),
            meta: { title: '登录日志与安全中心', icon: 'Lock', permissionPath: '/enterprise-platform' }
        },
        {
            path: '/platform/config-center',
            name: 'PlatformConfigCenter',
            component: () => import('@/views/PlatformConfigCenterPage.vue'),
            meta: { title: '系统配置中心', icon: 'Setting', permissionPath: '/enterprise-platform' }
        },
        {
            path: '/platform/archive-strategy',
            name: 'PlatformArchiveStrategy',
            component: () => import('@/views/PlatformArchiveStrategyPage.vue'),
            meta: { title: '数据归档策略', icon: 'FolderOpened', permissionPath: '/enterprise-platform' }
        },
        {
            path: '/platform/monitor',
            name: 'PlatformMonitor',
            component: () => import('@/views/PlatformMonitorPage.vue'),
            meta: { title: '接口与任务监控', icon: 'DataAnalysis', permissionPath: '/enterprise-platform' }
        },
        {
            path: '/platform/fine-permission',
            name: 'PlatformFinePermission',
            component: () => import('@/views/PlatformFinePermissionPage.vue'),
            meta: { title: '权限精细化控制', icon: 'Key', permissionPath: '/enterprise-platform' }
        },
        {
            path: '/platform/health-view',
            name: 'PlatformHealthView',
            component: () => import('@/views/PlatformHealthViewPage.vue'),
            meta: { title: '系统健康与运维视图', icon: 'Monitor', permissionPath: '/enterprise-platform' }
        },
        {
            path: '/import-task',
            name: 'ImportTask',
            component: () => import('@/views/ImportTaskCenter.vue'),
            meta: { title: '导入任务', icon: 'UploadFilled', permissionPath: '/import-task' }
        },
        {
            path: '/export-task',
            name: 'ExportTask',
            component: () => import('@/views/ExportTaskCenter.vue'),
            meta: { title: '导出任务', icon: 'Download', permissionPath: '/export-task' }
        },
        {
            path: '/intelligent',
            name: 'IntelligentOrdering',
            component: () => import('@/views/IntelligentOrdering.vue'),
            meta: { title: '智能订购中心', icon: 'Cpu', permissionPath: '/intelligent' }
        },
        {
            path: '/intelligent-closed-loop',
            name: 'IntelligentClosedLoop',
            component: () => import('@/views/OrderClosedLoopCenter.vue'),
            meta: { title: '订单闭环中心', icon: 'Finished', permissionPath: '/intelligent-closed-loop' }
        },
        {
            path: '/inventory-ops',
            name: 'InventoryOps',
            component: () => import('@/views/InventoryOpsCenter.vue'),
            meta: { title: '库存与仓配运营中心', icon: 'Box', permissionPath: '/inventory-ops' }
        },
        {
            path: '/channel-dealer-ops',
            name: 'ChannelDealerOps',
            component: () => import('@/views/ChannelDealerOpsCenter.vue'),
            meta: { title: '渠道与经销商经营中心', icon: 'DataLine', permissionPath: '/channel-dealer-ops' }
        },
        {
            path: '/workflow-center',
            name: 'WorkflowCenter',
            component: () => import('@/views/WorkflowCenter.vue'),
            meta: { title: '流程协同与待办中心', icon: 'Bell', permissionPath: '/workflow-center' }
        },
        {
            path: '/management-cockpit',
            name: 'ManagementCockpit',
            component: () => import('@/views/ManagementCockpit.vue'),
            meta: { title: '经营分析与管理驾驶舱', icon: 'DataBoard', permissionPath: '/management-cockpit' }
        },
        {
            path: '/pasture',
            name: 'PastureOverview',
            component: () => import('@/views/PastureOverview.vue'),
            meta: { title: '牧场与奶源运营中心', icon: 'Van', permissionPath: '/pasture' }
        },
        {
            path: '/profile',
            name: 'Profile',
            component: () => import('@/views/Profile.vue'),
            meta: { title: '个人中心' }
        },
        {
            path: '/mdm/sku',
            name: 'MdmSkuList',
            component: () => import('@/views/MdmSkuList.vue'),
            meta: { title: 'SKU管理', icon: 'Goods', requiresSuperAdmin: true, permissionPath: '/mdm/sku' }
        },
        {
            path: '/mdm/reseller-relation',
            name: 'MdmResellerRelation',
            component: () => import('@/views/MdmResellerRelation.vue'),
            meta: { title: '经销关系', icon: 'Connection', requiresSuperAdmin: true, permissionPath: '/mdm/reseller-relation' }
        },
        {
            path: '/forgot-password',
            name: 'ForgotPassword',
            component: () => import('@/views/ForgotPassword.vue'),
            meta: { title: '忘记密码' }
        },
        {
            path: '/mdm/category',
            name: 'MdmCategoryTree',
            component: () => import('@/views/MdmCategoryTree.vue'),
            meta: { title: '品类管理', icon: 'List', requiresSuperAdmin: true, permissionPath: '/mdm/category' }
        },
        {
            path: '/mdm/warehouse',
            name: 'MdmWarehouseList',
            component: () => import('@/views/MdmWarehouseList.vue'),
            meta: { title: '仓库管理', icon: 'HomeFilled', requiresSuperAdmin: true, permissionPath: '/mdm/warehouse' }
        },
        {
            path: '/mdm/factory',
            name: 'MdmFactoryList',
            component: () => import('@/views/MdmFactoryList.vue'),
            meta: { title: '工厂管理', icon: 'SetUp', requiresSuperAdmin: true, permissionPath: '/mdm/factory' }
        },
        {
            path: '/mdm/channel',
            name: 'MdmChannelTree',
            component: () => import('@/views/MdmChannelTree.vue'),
            meta: { title: '渠道管理', icon: 'DataAnalysis', requiresSuperAdmin: true, permissionPath: '/mdm/channel' }
        },
        {
            path: '/mdm/reseller',
            name: 'MdmResellerList',
            component: () => import('@/views/MdmResellerList.vue'),
            meta: { title: '经销商管理', icon: 'UserFilled', requiresSuperAdmin: true, permissionPath: '/mdm/reseller' }
        },
        {
            path: '/mdm/org',
            name: 'MdmOrgTree',
            component: () => import('@/views/MdmOrgTree.vue'),
            meta: { title: '组织机构', icon: 'OfficeBuilding', requiresSuperAdmin: true, permissionPath: '/mdm/org' }
        },
        {
            path: '/mdm/calendar',
            name: 'MdmCalendar',
            component: () => import('@/views/MdmCalendar.vue'),
            meta: { title: '业务日历', icon: 'Calendar', requiresSuperAdmin: true, permissionPath: '/mdm/calendar' }
        },
        {
            path: '/mdm/rltn/warehouse-sku',
            name: 'MdmRltnWarehouseSku',
            component: () => import('@/views/MdmRltnWarehouseSku.vue'),
            meta: { title: '仓库-SKU关系', icon: 'Connection', requiresSuperAdmin: true, permissionPath: '/mdm/rltn/warehouse-sku' }
        },
        {
            path: '/mdm/rltn/org-reseller',
            name: 'MdmRltnOrgReseller',
            component: () => import('@/views/MdmRltnOrgReseller.vue'),
            meta: { title: '组织-经销商关系', icon: 'Connection', requiresSuperAdmin: true, permissionPath: '/mdm/rltn/org-reseller' }
        },
        {
            path: '/mdm/rltn/product-sku',
            name: 'MdmRltnProductSku',
            component: () => import('@/views/MdmRltnProductSku.vue'),
            meta: { title: '产品-SKU转换关系', icon: 'Connection', requiresSuperAdmin: true, permissionPath: '/mdm/rltn/product-sku' }
        },
        {
            path: '/mdm/governance',
            name: 'MdmGovernanceCenter',
            component: () => import('@/views/MdmGovernanceCenter.vue'),
            meta: { title: '主数据治理平台', icon: 'DataBoard', requiresSuperAdmin: true, permissionPath: '/mdm/governance' }
        }

    ]
})

const AUTH_PAGES = new Set(['/login', '/forgot-password'])
const sanitizeRedirectPath = (value: unknown) => {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
        return ''
    }
    return value
}

const clearSession = () => {
    localStorage.removeItem('currentUser')
    localStorage.removeItem('accessToken')
}

const buildLoginRedirect = (fullPath: string) => {
    const redirectPath = sanitizeRedirectPath(fullPath)
    return {
        path: '/login',
        query: redirectPath ? { redirect: redirectPath } : undefined,
        replace: true
    }
}

const ensureAccessContextLoaded = async (appStore: ReturnType<typeof useAppStore>) => {
    if (appStore.authLoaded) return true
    try {
        await appStore.fetchAccessContext()
        return true
    } catch {
        return false
    }
}

router.beforeEach(async (to) => {
    const accessToken = localStorage.getItem('accessToken')
    const authed = Boolean(accessToken)
    const isAuthPage = AUTH_PAGES.has(to.path)
    const appStore = useAppStore()

    if (!authed) {
        appStore.clearAccessContext()
        if (isAuthPage) return true
        clearSession()
        return buildLoginRedirect(to.fullPath)
    }

    const accessReady = await ensureAccessContextLoaded(appStore)
    if (!accessReady) {
        appStore.clearAccessContext()
        clearSession()
        return buildLoginRedirect(to.fullPath)
    }

    if (isAuthPage && authed) {
        const fallbackPath = appStore.getFirstAccessiblePath()
        return { path: fallbackPath, replace: true }
    }

    const permissionPath = typeof to.meta.permissionPath === 'string' ? to.meta.permissionPath : ''
    if (permissionPath && !appStore.canAccessPath(permissionPath)) {
        const fallbackPath = appStore.getFirstAccessiblePath()
        return { path: fallbackPath === to.path ? '/profile' : fallbackPath, replace: true }
    }

    return true
})

export default router

