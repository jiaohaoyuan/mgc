// 这个文件是什么作用显示的是什么：全局状态管理（Pinia Store）。显示/实现的是：存储和管理跨组件共享的全局状态（如用户登录信息、侧边栏折叠状态等）。
/**
 * 全局共享状态管理
 * 用 Pinia 持久化数据，解决路由切换导致各页面数据互不同步的问题
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import {
    type DeptNode,
    type PermNode,
    type PostItem,
    type RoleItem,
    type UserItem
} from '@/data/mockData'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'

export const useAppStore = defineStore('app', () => {
    const departments = ref<DeptNode[]>([])
    const posts = ref<PostItem[]>([])
    const roles = ref<RoleItem[]>([])
    const users = ref<UserItem[]>([])
    // 权限树，供权限管理和角色分配预览使用
    const permissionTree = ref<PermNode[]>([])
    // 页面/权限名称映射 { id -> name }，供角色管理"功能权限"列展示
    const pageNameMap = ref<Record<number, string>>({})
    // 防止并发重复请求
    let _loading = false

    // 初始化加载所有系统数据
    const fetchSystemData = async () => {
        if (_loading) return  // 已在加载中，直接返回避免竞态
        _loading = true
        try {
            // 1. 获取账号
            const userRes = await axios.get(`${API_BASE}/accounts`)
            users.value = userRes.data.data.map((u: any) => ({
                id: u.id,
                username: u.login_id,
                nickname: u.nick_name || u.name,
                phone: u.mobile || u.telephone || '',
                email: u.email || '',
                deptId: parseInt(u.department_id),
                deptName: '', // 稍后匹配
                status: u.status,
                roleIds: u.role_ids ? u.role_ids.split(',').map(Number) : [],
                postIds: u.post_ids ? u.post_ids.split(',') : [],
                createTime: u.created_time ? u.created_time.split('T')[0] : ''
            }))

            // 2. 获取部门
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

            // 3. 获取岗位，并补全 deptName
            const postRes = await axios.get(`${API_BASE}/jobtitles`)
            posts.value = postRes.data.data.map((p: any) => {
                // 用字符串==匹配部门ID（DB中均为字符串）
                const deptRow = rawDepts.find((d: any) => d.id == p.job_department_id)
                return {
                    id: p.id,          // varchar like 'J111'
                    name: p.job_title_name,
                    code: p.job_title_mark,
                    deptId: p.job_department_id,
                    deptName: deptRow ? deptRow.department_name : (p.job_department_id || ''),
                    status: 1,
                    sort: 0,
                }
            })

            // 4. 获取页面权限表，建立 id->name 映射，并构造权限树
            const permRes = await axios.get(`${API_BASE}/permissions`)
            const rawPerms = permRes.data.data
            const nameMap: Record<number, string> = {}
            rawPerms.forEach((pg: any) => { nameMap[pg.id] = pg.name })
            pageNameMap.value = nameMap

            // 构造权限树 (递归)
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

            // 5. 获取角色
            const roleRes = await axios.get(`${API_BASE}/roles`)
            roles.value = roleRes.data.data.map((r: any) => ({
                id: r.id,
                name: r.name,
                code: r.code || `ROLE_${r.id}`,
                status: r.status,
                sort: r.sort_no,
                permissionIds: r.permissionIds || [],
                postIds: r.postIds || [],
                remark: r.description || '',
                createTime: r.created_time ? r.created_time.split('T')[0] : '2026-03-30'
            }))

            // 补全用户部门名称 (使用 == 兼容 string/int)
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

    return { departments, posts, roles, users, pageNameMap, permissionTree, fetchSystemData }
})


