// 这个文件是什么作用显示的是什么：静态模拟数据文件。显示/实现的是：在没有后端接口或开发阶段兜底使用的一些前端写死的数据结构。
/**
 * 模拟数据 - 供应链权限管理
 * 包含三级组织架构、岗位、角色、权限、用户的完整数据关系
 */

/* ============================
 * 一、三级组织架构 (部门树)
 * ============================ */
export interface DeptNode {
    id: number
    label: string
    type: 'center' | 'department' | 'team'
    status: number // 1=启用 0=禁用
    sort: number
    leader?: string
    phone?: string
    email?: string
    children?: DeptNode[]
}

export const departmentTree: DeptNode[] = [
    {
        id: 100,
        label: '认养一头牛集团',
        type: 'center',
        status: 1,
        sort: 0,
        leader: '孙仕军',
        children: [
            {
                id: 110,
                label: '供应链管理中心',
                type: 'center',
                status: 1,
                sort: 1,
                leader: '王明',
                children: [
                    {
                        id: 111,
                        label: '上游牧业部',
                        type: 'department',
                        status: 1,
                        sort: 1,
                        leader: '张志伟',
                        children: [
                            { id: 1111, label: '奶牛育种岗', type: 'team', status: 1, sort: 1 },
                            { id: 1112, label: '饲料采购岗', type: 'team', status: 1, sort: 2 },
                            { id: 1113, label: '牧场数字化专员', type: 'team', status: 1, sort: 3 }
                        ]
                    },
                    {
                        id: 112,
                        label: '生产制造部',
                        type: 'department',
                        status: 1,
                        sort: 2,
                        leader: '李芳',
                        children: [
                            { id: 1121, label: '液态奶加工岗', type: 'team', status: 1, sort: 1 },
                            { id: 1122, label: '奶粉中控岗', type: 'team', status: 1, sort: 2 },
                            { id: 1123, label: '包装耗材管理', type: 'team', status: 1, sort: 3 }
                        ]
                    },
                    {
                        id: 113,
                        label: '冷链物流部',
                        type: 'department',
                        status: 1,
                        sort: 3,
                        leader: '刘强',
                        children: [
                            { id: 1131, label: '低温配送调度', type: 'team', status: 1, sort: 1 },
                            { id: 1132, label: '仓库库管员', type: 'team', status: 1, sort: 2 },
                            { id: 1133, label: '干线运输监控', type: 'team', status: 1, sort: 3 }
                        ]
                    }
                ]
            },
            {
                id: 120,
                label: '数智化运营中心',
                type: 'center',
                status: 1,
                sort: 2,
                leader: '赵芸',
                children: [
                    {
                        id: 121,
                        label: '需求规划部',
                        type: 'department',
                        status: 1,
                        sort: 1,
                        leader: '陈思',
                        children: [
                            { id: 1211, label: '销量预测算法员', type: 'team', status: 1, sort: 1 },
                            { id: 1212, label: 'S&OP计划员', type: 'team', status: 1, sort: 2 },
                            { id: 1213, label: '补货策略岗', type: 'team', status: 1, sort: 3 }
                        ]
                    },
                    {
                        id: 122,
                        label: '系统管理部',
                        type: 'department',
                        status: 1,
                        sort: 2,
                        leader: '周维',
                        children: [
                            { id: 1221, label: '平台运维', type: 'team', status: 1, sort: 1 },
                            { id: 1222, label: '权限审计员', type: 'team', status: 1, sort: 2 }
                        ]
                    }
                ]
            },
            {
                id: 130,
                label: '市场与渠道中心',
                type: 'center',
                status: 1,
                sort: 3,
                leader: '吴佳',
                children: [
                    {
                        id: 131,
                        label: '新零售运营部',
                        type: 'department',
                        status: 1,
                        sort: 1,
                        leader: '黄丽',
                        children: [
                            { id: 1311, label: '抖音直播运营', type: 'team', status: 1, sort: 1 },
                            { id: 1312, label: '天猫私域专员', type: 'team', status: 1, sort: 2 },
                            { id: 1313, label: '会员权益设计', type: 'team', status: 1, sort: 3 }
                        ]
                    },
                    {
                        id: 132,
                        label: '认养事业部',
                        type: 'department',
                        status: 1,
                        sort: 2,
                        leader: '林峰',
                        children: [
                            { id: 1321, label: '会员周期购管理', type: 'team', status: 1, sort: 1 },
                            { id: 1322, label: '奶卡兑换核销岗', type: 'team', status: 1, sort: 2 }
                        ]
                    }
                ]
            }
        ]
    }
]

/* ============================
 * 二、岗位数据
 * ============================ */
export interface PostItem {
    id: number
    name: string
    code: string
    deptId: number      // 归属三级部门ID
    deptName: string    // 归属部门名称
    status: number
    sort: number
    remark?: string
}

export const postList: PostItem[] = [
    { id: 1, name: '奶牛育种专员', code: 'POST_BREED', deptId: 1111, deptName: '上游牧业部 / 奶牛育种岗', status: 1, sort: 1, remark: '负责育种体系管理' },
    { id: 2, name: '饲料采购专员', code: 'POST_FEED', deptId: 1112, deptName: '上游牧业部 / 饲料采购岗', status: 1, sort: 2, remark: '负责饲料供应商管理与采购' },
    { id: 3, name: '牧场数字化专员', code: 'POST_FARM_DIG', deptId: 1113, deptName: '上游牧业部 / 牧场数字化专员', status: 1, sort: 3 },
    { id: 4, name: '液态奶加工主操', code: 'POST_LIQUID', deptId: 1121, deptName: '生产制造部 / 液态奶加工岗', status: 1, sort: 4 },
    { id: 5, name: '奶粉中控员', code: 'POST_POWDER', deptId: 1122, deptName: '生产制造部 / 奶粉中控岗', status: 1, sort: 5 },
    { id: 6, name: '包装耗材管理员', code: 'POST_PACK', deptId: 1123, deptName: '生产制造部 / 包装耗材管理', status: 1, sort: 6 },
    { id: 7, name: '低温配送调度员', code: 'POST_COLD', deptId: 1131, deptName: '冷链物流部 / 低温配送调度', status: 1, sort: 7 },
    { id: 8, name: '仓库库管员', code: 'POST_WH', deptId: 1132, deptName: '冷链物流部 / 仓库库管员', status: 1, sort: 8 },
    { id: 9, name: '干线运输监控员', code: 'POST_TRUNK', deptId: 1133, deptName: '冷链物流部 / 干线运输监控', status: 1, sort: 9 },
    { id: 10, name: '销量预测算法员', code: 'POST_FORECAST', deptId: 1211, deptName: '需求规划部 / 销量预测算法员', status: 1, sort: 10 },
    { id: 11, name: 'S&OP计划员', code: 'POST_SOP', deptId: 1212, deptName: '需求规划部 / S&OP计划员', status: 1, sort: 11 },
    { id: 12, name: '补货策略专员', code: 'POST_REPLEN', deptId: 1213, deptName: '需求规划部 / 补货策略岗', status: 1, sort: 12 },
    { id: 13, name: '平台运维工程师', code: 'POST_OPS', deptId: 1221, deptName: '系统管理部 / 平台运维', status: 1, sort: 13 },
    { id: 14, name: '权限审计员', code: 'POST_AUDIT', deptId: 1222, deptName: '系统管理部 / 权限审计员', status: 1, sort: 14 },
    { id: 15, name: '抖音直播运营', code: 'POST_DOUYIN', deptId: 1311, deptName: '新零售运营部 / 抖音直播运营', status: 1, sort: 15 },
    { id: 16, name: '天猫私域专员', code: 'POST_TMALL', deptId: 1312, deptName: '新零售运营部 / 天猫私域专员', status: 1, sort: 16 },
    { id: 17, name: '会员权益设计师', code: 'POST_VIP_DESIGN', deptId: 1313, deptName: '新零售运营部 / 会员权益设计', status: 1, sort: 17 },
    { id: 18, name: '会员周期购管理', code: 'POST_CYCLE', deptId: 1321, deptName: '认养事业部 / 会员周期购管理', status: 1, sort: 18 },
    { id: 19, name: '奶卡兑换核销员', code: 'POST_CARD', deptId: 1322, deptName: '认养事业部 / 奶卡兑换核销岗', status: 1, sort: 19 }
]

/* ============================
 * 三、权限菜单树
 * ============================ */
export interface PermNode {
    id: number
    label: string
    code?: string
    children?: PermNode[]
}

export const permissionTree: PermNode[] = [
    {
        id: 1,
        label: '系统管理',
        children: [
            {
                id: 11,
                label: '用户管理',
                children: [
                    { id: 111, label: '用户查看', code: 'sys:user:list' },
                    { id: 112, label: '用户新增/编辑', code: 'sys:user:edit' },
                    { id: 113, label: '用户删除', code: 'sys:user:delete' },
                    { id: 114, label: '用户导出', code: 'sys:user:export' },
                    { id: 115, label: '重置密码', code: 'sys:user:resetPwd' }
                ]
            },
            {
                id: 12,
                label: '角色管理',
                children: [
                    { id: 121, label: '角色查看', code: 'sys:role:list' },
                    { id: 122, label: '角色编辑', code: 'sys:role:edit' },
                    { id: 123, label: '角色权限分配', code: 'sys:role:assign' }
                ]
            },
            {
                id: 13,
                label: '部门管理',
                children: [
                    { id: 131, label: '部门查看', code: 'sys:dept:list' },
                    { id: 132, label: '部门新增/编辑', code: 'sys:dept:edit' },
                    { id: 133, label: '部门删除', code: 'sys:dept:delete' }
                ]
            },
            {
                id: 14,
                label: '岗位管理',
                children: [
                    { id: 141, label: '岗位查看', code: 'sys:post:list' },
                    { id: 142, label: '岗位编辑', code: 'sys:post:edit' },
                    { id: 143, label: '岗位删除', code: 'sys:post:delete' }
                ]
            }
        ]
    },
    {
        id: 2,
        label: '需求计划',
        children: [
            {
                id: 21,
                label: '计划管理',
                children: [
                    { id: 211, label: '查看计划列表', code: 'sc:plan:list' },
                    { id: 212, label: '创建计划', code: 'sc:plan:create' },
                    { id: 213, label: '调整预测参数', code: 'sc:plan:adjust' },
                    { id: 214, label: '计划审批推流', code: 'sc:plan:audit' },
                    { id: 215, label: '计划导出', code: 'sc:plan:export' }
                ]
            },
            {
                id: 22,
                label: '补货策略',
                children: [
                    { id: 221, label: '查看补货策略', code: 'sc:replen:list' },
                    { id: 222, label: '编辑补货规则', code: 'sc:replen:edit' },
                    { id: 223, label: '触发自动补货', code: 'sc:replen:trigger' }
                ]
            }
        ]
    },
    {
        id: 3,
        label: '生产制造',
        children: [
            {
                id: 31,
                label: '工单管理',
                children: [
                    { id: 311, label: '查看工单', code: 'mfg:order:list' },
                    { id: 312, label: '创建工单', code: 'mfg:order:create' },
                    { id: 313, label: '工单审核', code: 'mfg:order:audit' }
                ]
            },
            {
                id: 32,
                label: '质量管控',
                children: [
                    { id: 321, label: '质检报告查看', code: 'mfg:qc:list' },
                    { id: 322, label: '质检录入', code: 'mfg:qc:input' },
                    { id: 323, label: '质量追溯', code: 'mfg:qc:trace' }
                ]
            }
        ]
    },
    {
        id: 4,
        label: '低温冷链',
        children: [
            {
                id: 41,
                label: '温控监控',
                children: [
                    { id: 411, label: '实时温控监控', code: 'cc:temp:monitor' },
                    { id: 412, label: '温度报警设置', code: 'cc:temp:alarm' },
                    { id: 413, label: '温度日志导出', code: 'cc:temp:export' }
                ]
            },
            {
                id: 42,
                label: '配送管理',
                children: [
                    { id: 421, label: '配送单查看', code: 'cc:order:list' },
                    { id: 422, label: '异常配送拦截', code: 'cc:order:stop' },
                    { id: 423, label: '在途追踪', code: 'cc:order:track' }
                ]
            },
            {
                id: 43,
                label: '仓储管理',
                children: [
                    { id: 431, label: '库存查看', code: 'cc:wh:list' },
                    { id: 432, label: '出入库操作', code: 'cc:wh:io' },
                    { id: 433, label: '库存盘点', code: 'cc:wh:check' }
                ]
            }
        ]
    },
    {
        id: 5,
        label: '认养业务',
        children: [
            {
                id: 51,
                label: '会员管理',
                children: [
                    { id: 511, label: '会员列表', code: 'adopt:member:list' },
                    { id: 512, label: '周期购管理', code: 'adopt:cycle:manage' },
                    { id: 513, label: '奶卡兑换核销', code: 'adopt:card:verify' }
                ]
            }
        ]
    }
]

/* ============================
 * 四、角色数据
 * ============================ */
export interface RoleItem {
    id: number
    name: string
    code: string
    sort: number
    status: number
    permissionIds: number[]   // 拥有的权限节点ID
    postIds: number[]         // 关联的岗位ID（一角色多岗位）
    dataScopeType?: string
    dataScopeConfig?: Record<string, unknown>
    remark?: string
    createTime: string
}

export const roleList: RoleItem[] = [
    {
        id: 1,
        name: '超级管理员',
        code: 'ROLE_ADMIN',
        sort: 1,
        status: 1,
        permissionIds: [1, 11, 111, 112, 113, 114, 115, 12, 121, 122, 123, 13, 131, 132, 133, 14, 141, 142, 143, 2, 21, 211, 212, 213, 214, 215, 22, 221, 222, 223, 3, 31, 311, 312, 313, 32, 321, 322, 323, 4, 41, 411, 412, 413, 42, 421, 422, 423, 43, 431, 432, 433, 5, 51, 511, 512, 513],
        postIds: [13, 14],
        remark: '拥有全部权限',
        createTime: '2025-01-15'
    },
    {
        id: 2,
        name: '计划核算员',
        code: 'ROLE_PLANNER',
        sort: 2,
        status: 1,
        permissionIds: [2, 21, 211, 212, 213, 214, 215, 22, 221, 222, 223],
        postIds: [5, 11, 12],    // 跨部门：生产制造部-中控岗 + 需求规划部-S&OP + 补货策略
        remark: '需求计划与补货管理',
        createTime: '2025-02-20'
    },
    {
        id: 3,
        name: '冷链调度员',
        code: 'ROLE_COLD_CHAIN',
        sort: 3,
        status: 1,
        permissionIds: [4, 41, 411, 412, 413, 42, 421, 422, 423, 43, 431, 432, 433],
        postIds: [7, 8, 9],
        remark: '冷链物流全流程管理',
        createTime: '2025-03-10'
    },
    {
        id: 4,
        name: '生产主管',
        code: 'ROLE_MFG_LEAD',
        sort: 4,
        status: 1,
        permissionIds: [3, 31, 311, 312, 313, 32, 321, 322, 323],
        postIds: [4, 5, 6],
        remark: '生产制造全流程管理',
        createTime: '2025-03-15'
    },
    {
        id: 5,
        name: '认养业务专员',
        code: 'ROLE_ADOPT',
        sort: 5,
        status: 1,
        permissionIds: [5, 51, 511, 512, 513],
        postIds: [18, 19],
        remark: '会员认养业务操作',
        createTime: '2025-04-01'
    },
    {
        id: 6,
        name: '渠道运营专员',
        code: 'ROLE_CHANNEL',
        sort: 6,
        status: 1,
        permissionIds: [5, 51, 511, 512],
        postIds: [15, 16, 17],
        remark: '渠道与会员运营',
        createTime: '2025-04-10'
    },
    {
        id: 7,
        name: '数据查看员',
        code: 'ROLE_VIEWER',
        sort: 7,
        status: 1,
        permissionIds: [111, 121, 131, 141, 211, 221, 311, 321, 411, 421, 431, 511],
        postIds: [10, 14],
        remark: '只拥有各模块查看权限',
        createTime: '2025-05-01'
    }
]

/* ============================
 * 五、用户数据
 * ============================ */
export interface UserItem {
    id: number
    username: string
    nickname: string
    phone: string
    email: string
    deptId: number
    deptName: string
    postIds: number[]
    roleIds: number[]
    status: number
    createTime: string
    avatar?: string
}

export const userList: UserItem[] = [
    {
        id: 1,
        username: 'admin',
        nickname: '系统管理员',
        phone: '13800000001',
        email: 'admin@nainiu.com',
        deptId: 1222,
        deptName: '系统管理部 / 权限审计员',
        postIds: [14],
        roleIds: [1],
        status: 1,
        createTime: '2025-01-15'
    },
    {
        id: 2,
        username: 'zhangzw',
        nickname: '张志伟',
        phone: '13800000002',
        email: 'zhangzw@nainiu.com',
        deptId: 1111,
        deptName: '上游牧业部 / 奶牛育种岗',
        postIds: [1],
        roleIds: [7],
        status: 1,
        createTime: '2025-02-01'
    },
    {
        id: 3,
        username: 'lifang',
        nickname: '李芳',
        phone: '13800000003',
        email: 'lifang@nainiu.com',
        deptId: 1121,
        deptName: '生产制造部 / 液态奶加工岗',
        postIds: [4, 5],
        roleIds: [4],
        status: 1,
        createTime: '2025-02-10'
    },
    {
        id: 4,
        username: 'liuqiang',
        nickname: '刘强',
        phone: '13800000004',
        email: 'liuqiang@nainiu.com',
        deptId: 1131,
        deptName: '冷链物流部 / 低温配送调度',
        postIds: [7],
        roleIds: [3],
        status: 1,
        createTime: '2025-03-10'
    },
    {
        id: 5,
        username: 'chensi',
        nickname: '陈思',
        phone: '13800000005',
        email: 'chensi@nainiu.com',
        deptId: 1212,
        deptName: '需求规划部 / S&OP计划员',
        postIds: [11],
        roleIds: [2],
        status: 1,
        createTime: '2025-03-20'
    },
    {
        id: 6,
        username: 'huangli',
        nickname: '黄丽',
        phone: '13800000006',
        email: 'huangli@nainiu.com',
        deptId: 1311,
        deptName: '新零售运营部 / 抖音直播运营',
        postIds: [15],
        roleIds: [6],
        status: 1,
        createTime: '2025-04-01'
    },
    {
        id: 7,
        username: 'linfeng',
        nickname: '林峰',
        phone: '13800000007',
        email: 'linfeng@nainiu.com',
        deptId: 1321,
        deptName: '认养事业部 / 会员周期购管理',
        postIds: [18],
        roleIds: [5],
        status: 1,
        createTime: '2025-04-15'
    },
    {
        id: 8,
        username: 'zhouwei',
        nickname: '周维',
        phone: '13800000008',
        email: 'zhouwei@nainiu.com',
        deptId: 1221,
        deptName: '系统管理部 / 平台运维',
        postIds: [13],
        roleIds: [1, 7],
        status: 1,
        createTime: '2025-01-20'
    },
    {
        id: 9,
        username: 'wangxl',
        nickname: '王秀兰',
        phone: '13800000009',
        email: 'wangxl@nainiu.com',
        deptId: 1132,
        deptName: '冷链物流部 / 仓库库管员',
        postIds: [8],
        roleIds: [3],
        status: 1,
        createTime: '2025-05-01'
    },
    {
        id: 10,
        username: 'sunjm',
        nickname: '孙佳敏',
        phone: '13800000010',
        email: 'sunjm@nainiu.com',
        deptId: 1312,
        deptName: '新零售运营部 / 天猫私域专员',
        postIds: [16],
        roleIds: [6],
        status: 0,
        createTime: '2025-06-01'
    }
]

/* ============================
 * 六、辅助函数
 * ============================ */

/** 扁平化部门树为级联选择器数据 */
export function flattenDeptTree(nodes: DeptNode[]): any[] {
    return nodes.map(n => ({
        value: n.id,
        label: n.label,
        children: n.children ? flattenDeptTree(n.children) : undefined
    }))
}

/** 根据部门ID查找完整路径名称 */
export function getDeptPathName(deptId: number, nodes: DeptNode[] = departmentTree, path: string[] = []): string {
    for (const node of nodes) {
        const currentPath = [...path, node.label]
        if (node.id === deptId) {
            return currentPath.slice(1).join(' / ')  // 跳过根节点
        }
        if (node.children) {
            const result = getDeptPathName(deptId, node.children, currentPath)
            if (result) return result
        }
    }
    return ''
}

/** 获取某部门ID下所有可选岗位 */
export function getPostsByDeptId(deptId: number, posts: PostItem[] = postList, depts: DeptNode[] = departmentTree): PostItem[] {
    // 向上查找所属二级部门的所有三级岗位
    const parentDeptId = findParentDeptId(deptId, depts)
    const allTeamIds = collectTeamIds(parentDeptId || deptId, depts)
    return posts.filter(p => allTeamIds.includes(p.deptId))
}

function findParentDeptId(targetId: number, nodes: DeptNode[], parentId?: number): number | undefined {
    for (const node of nodes) {
        if (node.id === targetId) return parentId
        if (node.children) {
            const found = findParentDeptId(targetId, node.children, node.id)
            if (found !== undefined) return found
        }
    }
    return undefined
}

function collectTeamIds(parentId: number, nodes: DeptNode[]): number[] {
    const ids: number[] = []
    function walk(ns: DeptNode[], collecting: boolean) {
        for (const n of ns) {
            const startCollect = collecting || n.id === parentId
            if (startCollect && n.type === 'team') ids.push(n.id)
            if (n.children) walk(n.children, startCollect)
        }
    }
    walk(nodes, false)
    return ids
}
