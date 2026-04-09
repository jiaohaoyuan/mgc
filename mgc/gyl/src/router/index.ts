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
            path: '/pasture',
            name: 'PastureOverview',
            component: () => import('@/views/PastureOverview.vue'),
            meta: { title: '牧场概览', icon: 'Van', permissionPath: '/pasture' }
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

router.beforeEach(async (to) => {
    const accessToken = localStorage.getItem('accessToken')
    const authed = Boolean(accessToken)
    const isAuthPage = AUTH_PAGES.has(to.path)
    const appStore = useAppStore()

    if (!authed && !isAuthPage) {
        appStore.clearAccessContext()
        clearSession()
        const redirectPath = sanitizeRedirectPath(to.fullPath)
        return {
            path: '/login',
            query: redirectPath ? { redirect: redirectPath } : undefined,
            replace: true
        }
    }

    if (!authed && isAuthPage) {
        appStore.clearAccessContext()
        return true
    }

    try {
        await appStore.fetchAccessContext()
    } catch {
        appStore.clearAccessContext()
        clearSession()
        const redirectPath = sanitizeRedirectPath(to.fullPath)
        return {
            path: '/login',
            query: redirectPath ? { redirect: redirectPath } : undefined,
            replace: true
        }
    }

    const fallbackPath = appStore.getFirstAccessiblePath()

    if (isAuthPage && authed) {
        return { path: fallbackPath, replace: true }
    }

    const requiresSuperAdmin = Boolean(to.meta.requiresSuperAdmin)
    if (requiresSuperAdmin && !appStore.isSuperAdmin) {
        return { path: fallbackPath === to.path ? '/profile' : fallbackPath, replace: true }
    }

    const permissionPath = typeof to.meta.permissionPath === 'string' ? to.meta.permissionPath : ''
    if (permissionPath && !appStore.canAccessPath(permissionPath)) {
        return { path: fallbackPath === to.path ? '/profile' : fallbackPath, replace: true }
    }

    return true
})

export default router
