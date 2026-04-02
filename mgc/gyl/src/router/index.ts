// 这个文件是什么作用显示的是什么：前端路由配置文件。显示/实现的是：定义各个URL路径与Vue组件之间的映射关系及路由守卫。
/**
 * 路由配置
 * 供应链决策平台 - 组织权限管理模块
 */
import { createRouter, createWebHistory } from 'vue-router'

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
            meta: { title: '部门管理', icon: 'OfficeBuilding' }
        },
        {
            path: '/user',
            name: 'User',
            component: () => import('@/views/UserManage.vue'),
            meta: { title: '用户管理', icon: 'User' }
        },
        {
            path: '/role',
            name: 'Role',
            component: () => import('@/views/RoleManage.vue'),
            meta: { title: '角色管理', icon: 'Key' }
        },
        {
            path: '/post',
            name: 'Post',
            component: () => import('@/views/PostManage.vue'),
            meta: { title: '岗位管理', icon: 'Stamp' }
        },
        {
            path: '/permission',
            name: 'Permission',
            component: () => import('@/views/PermissionManage.vue'),
            meta: { title: '权限管理', icon: 'Lock' }
        },
        {
            path: '/intelligent',
            name: 'IntelligentOrdering',
            component: () => import('@/views/IntelligentOrdering.vue'),
            meta: { title: '智能订购中心', icon: 'Cpu' }
        },
        {
            path: '/pasture',
            name: 'PastureOverview',
            component: () => import('@/views/PastureOverview.vue'),
            meta: { title: '牧场概览', icon: 'Van' }
        },
        {
            path: '/channels',
            name: 'ChannelManage',
            component: () => import('@/views/ChannelManage.vue'),
            meta: { title: '三级渠道', icon: 'DataAnalysis' }
        },
        {
            path: '/categories',
            name: 'CategoryManage',
            component: () => import('@/views/CategoryManage.vue'),
            meta: { title: '品类管理', icon: 'SetUp' }
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
            meta: { title: 'SKU管理', icon: 'Goods' }
        },
        {
            path: '/mdm/reseller-relation',
            name: 'MdmResellerRelation',
            component: () => import('@/views/MdmResellerRelation.vue'),
            meta: { title: '经销关系', icon: 'Connection' }
        },
        {
            path: '/forgot-password',
            name: 'ForgotPassword',
            component: () => import('@/views/ForgotPassword.vue'),
            meta: { title: '忘记密码' }
        }
    ]
})

// 路由拦截器
router.beforeEach((to, from, next) => {
    const isAuthenticated = localStorage.getItem('isAuthenticated')
    const accessToken = localStorage.getItem('accessToken')
    const authed = Boolean(isAuthenticated && accessToken)
    if (to.path !== '/login' && to.path !== '/forgot-password' && !isAuthenticated) {
        localStorage.removeItem('isAuthenticated')
        localStorage.removeItem('currentUser')
        localStorage.removeItem('accessToken')
        next('/login')
    } else if (to.path !== '/login' && to.path !== '/forgot-password' && !authed) {
        next('/login')
    } else if ((to.path === '/login' || to.path === '/forgot-password') && authed) {
        next('/department')
    } else {
        next()
    }
})

export default router
