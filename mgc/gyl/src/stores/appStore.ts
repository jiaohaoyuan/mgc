import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import axios from 'axios'
import {
    type DeptNode,
    type PermNode,
    type PostItem,
    type RoleItem,
    type UserItem
} from '@/data/mockData'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'

interface AuthContext {
    id: number | null
    username: string
    roleIds: number[]
    roleNames: string[]
    permissionIds: number[]
    permissionPaths: string[]
    isSuperAdmin: boolean
}

type AuthContextSource = Partial<AuthContext> & {
    roleIds?: unknown[]
    roleNames?: unknown[]
    permissionIds?: unknown[]
    permissionPaths?: unknown[]
}

const normalizePath = (rawPath?: string | null) => {
    if (!rawPath) return ''
    if (rawPath === '/') return '/'
    return rawPath.replace(/\/+$/, '')
}

const dedupePaths = (paths: unknown[]) => {
    const set = new Set<string>()
    for (const raw of paths || []) {
        const path = normalizePath(String(raw || ''))
        if (path) set.add(path)
    }
    return [...set]
}

const emptyAuthContext = (): AuthContext => ({
    id: null,
    username: '',
    roleIds: [],
    roleNames: [],
    permissionIds: [],
    permissionPaths: [],
    isSuperAdmin: false
})

const readCurrentUser = () => {
    try {
        const raw = localStorage.getItem('currentUser')
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

const toNumberList = (value: unknown) => {
    if (!Array.isArray(value)) return []
    return value
        .map((item) => Number(item))
        .filter((item) => !Number.isNaN(item))
}

const toStringList = (value: unknown) => {
    if (!Array.isArray(value)) return []
    return value.map((item) => String(item))
}

const buildAuthContext = (source: AuthContextSource = {}): AuthContext => ({
    id: source.id ?? null,
    username: source.username || '',
    roleIds: toNumberList(source.roleIds),
    roleNames: toStringList(source.roleNames),
    permissionIds: toNumberList(source.permissionIds),
    permissionPaths: dedupePaths(source.permissionPaths || []),
    isSuperAdmin: Boolean(source.isSuperAdmin)
})

export const useAppStore = defineStore('app', () => {
    const departments = ref<DeptNode[]>([])
    const posts = ref<PostItem[]>([])
    const roles = ref<RoleItem[]>([])
    const users = ref<UserItem[]>([])
    const permissionTree = ref<PermNode[]>([])
    const pageNameMap = ref<Record<number, string>>({})

    const authContext = ref<AuthContext>(buildAuthContext(readCurrentUser()))
    const authLoaded = ref(false)
    const authLoading = ref(false)

    const permissionPathSet = computed(() => new Set(authContext.value.permissionPaths.map(normalizePath).filter(Boolean)))
    const isSuperAdmin = computed(() => Boolean(authContext.value.isSuperAdmin))

    let _loading = false
    let accessContextPromise: Promise<void> | null = null

    const syncCurrentUserStorage = () => {
        const prev = readCurrentUser()
        const nextRole = authContext.value.isSuperAdmin
            ? '超级管理员'
            : (authContext.value.roleNames[0] || prev.role || '普通用户')

        localStorage.setItem('currentUser', JSON.stringify({
            ...prev,
            id: authContext.value.id,
            username: authContext.value.username || prev.username || '',
            nickname: prev.nickname || authContext.value.username || '',
            role: nextRole,
            roleIds: authContext.value.roleIds,
            roleNames: authContext.value.roleNames,
            permissionIds: authContext.value.permissionIds,
            permissionPaths: authContext.value.permissionPaths,
            isSuperAdmin: authContext.value.isSuperAdmin
        }))
    }

    const setAccessContext = (source: AuthContextSource = {}) => {
        authContext.value = buildAuthContext(source)
        authLoaded.value = true
        syncCurrentUserStorage()
    }

    const fetchAccessContext = async (force = false) => {
        if (!localStorage.getItem('accessToken')) {
            clearAccessContext()
            return
        }

        if (!force && authLoaded.value) return
        if (accessContextPromise) return accessContextPromise

        authLoading.value = true
        accessContextPromise = axios.get(`${API_BASE}/me`)
            .then((res) => {
                const data = res.data?.data || {}
                setAccessContext(data)
            })
            .catch((err) => {
                authContext.value = emptyAuthContext()
                authLoaded.value = false
                console.error('Failed to fetch access context:', err)
                throw err
            })
            .finally(() => {
                authLoading.value = false
                accessContextPromise = null
            })

        return accessContextPromise
    }

    const clearAccessContext = () => {
        authContext.value = emptyAuthContext()
        authLoaded.value = false
        accessContextPromise = null
    }

    const canAccessPath = (rawPath: string) => {
        const path = normalizePath(rawPath)
        if (!path) return true

        if (isSuperAdmin.value) {
            return true
        }

        if (path.startsWith('/platform/') && permissionPathSet.value.has('/enterprise-platform')) {
            return true
        }

        return permissionPathSet.value.has(path)
    }

    const filterNavItems = <T extends { path: string }>(items: T[]) => {
        return items.filter(item => canAccessPath(item.path))
    }

    const getFirstAccessiblePath = () => {
        const candidates = [
            '/department',
            '/user',
            '/role',
            '/post',
            '/permission',
            '/dict-center',
            '/operation-log',
            '/platform/audit-log',
            '/platform/security-center',
            '/platform/config-center',
            '/platform/archive-strategy',
            '/platform/monitor',
            '/platform/fine-permission',
            '/platform/health-view',
            '/import-task',
            '/export-task',
            '/pasture',
            '/intelligent',
            '/intelligent-closed-loop',
            '/inventory-ops',
            '/channel-dealer-ops',
            '/demand/channel-plan',
            '/workflow-center',
            '/management-cockpit',
            '/mdm/sku',
            '/mdm/spu',
            '/mdm/reseller-relation',
            '/mdm/category',
            '/mdm/warehouse',
            '/mdm/factory',
            '/mdm/channel',
            '/mdm/reseller',
            '/mdm/org',
            '/mdm/calendar',
            '/mdm/rltn/warehouse-sku',
            '/mdm/rltn/org-reseller',
            '/mdm/rltn/product-sku',
            '/mdm/governance',
            '/profile'
        ]

        if (isSuperAdmin.value) {
            return '/mdm/sku'
        }

        return candidates.find(path => canAccessPath(path)) || '/profile'
    }

    const fetchSystemData = async () => {
        if (_loading) return
        _loading = true
        try {
            const userRes = await axios.get(`${API_BASE}/accounts`)
            users.value = userRes.data.data.map((u: any) => ({
                id: u.id,
                username: u.login_id,
                nickname: u.nick_name || u.name,
                phone: u.mobile || u.telephone || '',
                email: u.email || '',
                deptId: parseInt(u.department_id),
                deptName: '',
                status: u.status,
                roleIds: u.role_ids ? u.role_ids.split(',').map(Number) : [],
                postIds: u.post_ids ? u.post_ids.split(',') : [],
                createTime: u.created_time ? u.created_time.split('T')[0] : ''
            }))

            const deptRes = await axios.get(`${API_BASE}/departments`)
            const rawDepts = deptRes.data.data
            const levelMap: any = { 1: 'center', 2: 'department', 3: 'team' }

            departments.value = rawDepts.filter((d: any) => d.sup_dep_id === '0' || !d.sup_dep_id).map((d: any) => ({
                id: d.id,
                label: d.department_name,
                parentId: 0,
                type: levelMap[d.level] || 'team',
                sort: d.sort_no,
                leader: d.leader || '-',
                children: rawDepts.filter((c: any) => c.sup_dep_id == d.id).sort((a: any, b: any) => a.sort_no - b.sort_no).map((c: any) => ({
                    id: c.id,
                    label: c.department_name,
                    parentId: d.id,
                    type: levelMap[c.level] || 'team',
                    sort: c.sort_no,
                    leader: c.leader || '-',
                    children: rawDepts.filter((t: any) => t.sup_dep_id == c.id).sort((a: any, b: any) => a.sort_no - b.sort_no).map((t: any) => ({
                        id: t.id,
                        label: t.department_name,
                        parentId: c.id,
                        type: levelMap[t.level] || 'team',
                        sort: t.sort_no,
                        leader: t.leader || '-'
                    }))
                }))
            })).sort((a: any, b: any) => a.sort - b.sort)

            const postRes = await axios.get(`${API_BASE}/jobtitles`)
            posts.value = postRes.data.data.map((p: any) => {
                const deptRow = rawDepts.find((d: any) => d.id == p.job_department_id)
                return {
                    id: p.id,
                    name: p.job_title_name,
                    code: p.job_title_mark,
                    deptId: p.job_department_id,
                    deptName: deptRow ? deptRow.department_name : (p.job_department_id || ''),
                    status: 1,
                    sort: 0,
                }
            })

            const permRes = await axios.get(`${API_BASE}/permissions`)
            const rawPerms = permRes.data.data
            const nameMap: Record<number, string> = {}
            rawPerms.forEach((pg: any) => { nameMap[pg.id] = pg.name })
            pageNameMap.value = nameMap

            const buildTree = (parentId: number): PermNode[] => {
                return rawPerms
                    .filter((p: any) => p.parent_id == parentId)
                    .sort((a: any, b: any) => (a.sort_no || 0) - (b.sort_no || 0))
                    .map((p: any) => ({
                        id: p.id,
                        label: p.name,
                        code: p.code,
                        children: buildTree(p.id)
                    }))
            }
            permissionTree.value = buildTree(0)

            const roleRes = await axios.get(`${API_BASE}/roles`)
            roles.value = roleRes.data.data.map((r: any) => ({
                id: r.id,
                name: r.name,
                code: r.code || `ROLE_${r.id}`,
                status: r.status,
                sort: r.sort_no,
                permissionIds: r.permissionIds || [],
                postIds: r.postIds || [],
                dataScopeType: r.dataScopeType || 'ALL',
                dataScopeConfig: r.dataScopeConfig || {},
                remark: r.description || '',
                createTime: r.created_time ? r.created_time.split('T')[0] : '2026-03-30'
            }))

            users.value.forEach(u => {
                const d = rawDepts.find((rd: any) => rd.id == u.deptId)
                if (d) u.deptName = d.department_name
            })

            console.log('System data fetched from MySQL successfully')
        } catch (err) {
            console.error('Failed to fetch system data from backend:', err)
        } finally {
            _loading = false
        }
    }

    return {
        departments,
        posts,
        roles,
        users,
        pageNameMap,
        permissionTree,
        authContext,
        authLoaded,
        isSuperAdmin,
        setAccessContext,
        fetchAccessContext,
        clearAccessContext,
        canAccessPath,
        filterNavItems,
        getFirstAccessiblePath,
        fetchSystemData
    }
})
