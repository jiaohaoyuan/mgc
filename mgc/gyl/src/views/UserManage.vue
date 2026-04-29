<!-- 这个文件是什么作用显示的是什么：这是用户管理页面。显示/实现的是：系统内所有用户的列表信息，提供针对用户的增删改查和角色分配功能。 -->
<script setup lang="ts">
/**
 * 用户管理页面
 * 支持用户CRUD，部门级联选择，岗位/角色多选
 * 选择角色后侧边实时显示权限树预览
 */
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  flattenDeptTree,
  getDeptPathName,
  getPostsByDeptId,
  type UserItem,
  type PermNode
} from '@/data/mockData'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

const appStore = useAppStore()
const {
  users: tableData,
  permissionTree,
  departments: departmentTree,
  roles: roleList,
  posts: postList
} = storeToRefs(appStore)


// 搜索
const searchKeyword = ref('')
const searchStatus = ref<number | undefined>(undefined)

// 分页
const currentPage = ref(1)
const pageSize = ref(10)

const filteredData = computed(() => {
  return tableData.value.filter(u => {
    const matchKw = !searchKeyword.value ||
      u.nickname.includes(searchKeyword.value) ||
      u.username.includes(searchKeyword.value) ||
      u.phone.includes(searchKeyword.value)
    const matchStatus = searchStatus.value === undefined || u.status === searchStatus.value
    return matchKw && matchStatus
  })
})

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredData.value.slice(start, end)
})

watch([searchKeyword, searchStatus], () => {
  currentPage.value = 1
})

// 部门级联选择器数据
const deptCascaderOptions = computed(() => flattenDeptTree(departmentTree.value))

// 弹窗控制
const dialogVisible = ref(false)
const dialogTitle = ref('新增用户')
const isEdit = ref(false)

// 权限预览抽屉
const showPermPreview = ref(false)

// 表单
const formRef = ref()
const formData = reactive<{
  id: number
  username: string
  nickname: string
  phone: string
  email: string
  deptIds: number[]
  postIds: number[]
  roleIds: number[]
  status: number
  password: string
}>({
  id: 0,
  username: '',
  nickname: '',
  phone: '',
  email: '',
  deptIds: [],
  postIds: [],
  roleIds: [],
  status: 1,
  password: ''
})

const PHONE_REGEX = /^1[3-9]\d{9}$/
const EMAIL_REGEX = /^(?=.{6,254}$)(?=.{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])$/

const validatePhone = (_rule: any, value: string, callback: (error?: Error) => void) => {
  const phone = String(value || '').trim()
  if (!phone) {
    callback(new Error('请输入手机号'))
    return
  }
  if (!PHONE_REGEX.test(phone)) {
    callback(new Error('请输入正确的11位手机号'))
    return
  }
  callback()
}

const validateEmail = (_rule: any, value: string, callback: (error?: Error) => void) => {
  const email = String(value || '').trim()
  if (!email) {
    callback()
    return
  }
  if (!EMAIL_REGEX.test(email)) {
    callback(new Error('请输入正确的邮箱地址'))
    return
  }
  callback()
}

const rules: Record<string, any> = {
  username: [{ required: true, message: '请输入用户账号', trigger: 'blur' }],
  nickname: [{ required: true, message: '请输入用户昵称', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  deptIds: [{ required: true, message: '请选择所属部门', trigger: 'change' }]
}

// 动态候选岗位（根据选择的部门过滤）
rules.phone = [{ validator: validatePhone, trigger: 'blur' }]
rules.email = [{ validator: validateEmail, trigger: 'blur' }]

const availablePosts = computed(() => {
  if (formData.deptIds.length === 0) return postList.value
  const lastDeptId = formData.deptIds[formData.deptIds.length - 1] as number
  return getPostsByDeptId(lastDeptId, postList.value, departmentTree.value)
})

// 选中角色后的权限预览数据
const previewPermissions = computed(() => {
  const selectedRoles = roleList.value.filter(r => formData.roleIds.includes(r.id))
  const allPermIds = new Set<number>()
  selectedRoles.forEach(r => r.permissionIds.forEach(id => allPermIds.add(id)))
  // 过滤权限树只留有权限的节点
  function filterTree(nodes: PermNode[]): PermNode[] {
    return nodes
      .map(n => {
        const filtered: PermNode = { ...n }
        if (n.children) {
          filtered.children = filterTree(n.children)
        }
        return filtered
      })
      .filter(n => allPermIds.has(n.id) || (n.children && n.children.length > 0))
  }
  return filterTree(permissionTree.value)
})

// 监听部门变更，清空岗位选择
watch(() => formData.deptIds, () => {
  formData.postIds = []
})

// 获取角色名
function getRoleName(id: number | string) {
  return roleList.value.find(r => String(r.id) === String(id))?.name || `未匹配角色(${id})`
}

// 获取岗位名
function getPostName(id: string | number) {
  // 后端岗位ID可能是字符串(如'J311')，统一转字符串比较，避免空标签显示成方框。
  return postList.value.find(p => String(p.id) === String(id))?.name || `未匹配岗位(${id})`
}

// 权限检查：只有超级管理员可操作
const isSuperAdmin = computed(() => {
  try {
    const s = localStorage.getItem('currentUser')
    const user = s ? JSON.parse(s) : null
    return user?.role === '超级管理员'
  } catch { return false }
})

function checkSuperAdmin(): boolean {
  if (!isSuperAdmin.value) {
    ElMessage.warning('只有超级管理员可操作，普通用户禁止操作')
    return false
  }
  return true
}

// 新增用户
function handleAdd() {
  if (!checkSuperAdmin()) return
  isEdit.value = false
  dialogTitle.value = '新增用户'
  Object.assign(formData, {
    id: Date.now(),
    username: '',
    nickname: '',
    phone: '',
    email: '',
    deptIds: [],
    postIds: [],
    roleIds: [],
    status: 1,
    password: ''
  })
  showPermPreview.value = false
  dialogVisible.value = true
}

// 编辑用户
function handleEdit(row: UserItem) {
  if (!checkSuperAdmin()) return
  isEdit.value = true
  dialogTitle.value = `编辑用户 - ${row.nickname}`
  // 构造级联选择器路径
  const cascaderPath = findCascaderPath(row.deptId, deptCascaderOptions.value)
  Object.assign(formData, {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    phone: row.phone,
    email: row.email,
    deptIds: cascaderPath,
    postIds: [...row.postIds],
    roleIds: [...row.roleIds],
    status: row.status,
    password: ''
  })
  showPermPreview.value = false
  dialogVisible.value = true
}

function findCascaderPath(targetId: number, options: any[], path: number[] = []): number[] {
  for (const opt of options) {
    const currentPath = [...path, opt.value]
    if (opt.value === targetId) return currentPath
    if (opt.children) {
      const result = findCascaderPath(targetId, opt.children, currentPath)
      if (result.length > 0) return result
    }
  }
  return []
}

import axios from 'axios'
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'

// 删除用户
async function handleDelete(row: UserItem) {
  if (!checkSuperAdmin()) return
  try {
    await ElMessageBox.confirm(
      `确认删除用户 "${row.nickname}" (${row.username}) 吗？`,
      '删除确认',
      { type: 'warning' }
    )
    await axios.delete(`${API_BASE}/accounts/${row.id}`)
    await appStore.fetchSystemData()
    ElMessage.success('删除成功')
  } catch (err) {
    if (err !== 'cancel') {
        ElMessage.error('删除失败')
    }
  }
}

// 切换状态
async function handleToggleStatus(row: UserItem) {
  if (!checkSuperAdmin()) return
  const newStatus = row.status === 1 ? 0 : 1
  try {
     await axios.put(`${API_BASE}/accounts/${row.id}/status`, { status: newStatus })
     row.status = newStatus
     ElMessage.success(`用户 ${row.nickname} 已${newStatus === 1 ? '启用' : '禁用'}`)
  } catch (err) {
     ElMessage.error('更新状态失败')
  }
}

// 保存
async function handleSubmit() {
  await formRef.value?.validate()
  const lastDeptId = formData.deptIds[formData.deptIds.length - 1] as number
  const username = formData.username.trim()
  const nickname = formData.nickname.trim()
  const phone = formData.phone.trim()
  const email = formData.email.trim()
  const password = formData.password.trim()

  if (!PHONE_REGEX.test(phone)) {
    ElMessage.error('请输入正确的11位手机号')
    return
  }

  if (email && !EMAIL_REGEX.test(email)) {
    ElMessage.error('请输入正确的邮箱地址')
    return
  }

  const payload = {
    username,
    password: password || '123456',
    nickname,
    phone,
    email,
    deptId: lastDeptId,
    status: formData.status,
    roleIds: formData.roleIds,
    postIds: formData.postIds
  }

  try {
    if (isEdit.value) {
      await axios.put(`${API_BASE}/accounts/${formData.id}`, payload)
      ElMessage.success('编辑成功')
    } else {
      await axios.post(`${API_BASE}/register`, payload)
      ElMessage.success('新增成功')
    }
    await appStore.fetchSystemData()
    dialogVisible.value = false
  } catch (err) {
    ElMessage.error('保存失败: ' + (err as any).response?.data?.msg || '未知错误')
  }
}

// 重置密码
function handleResetPwd(row: UserItem) {
  if (!checkSuperAdmin()) return
  ElMessageBox.confirm(`确认重置用户 "${row.nickname}" 的密码为默认密码 123456？`, '重置密码', { type: 'warning' })
    .then(() => {
      ElMessage.success('密码重置成功')
    }).catch(() => {})
}
</script>

<template>
  <div>
    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-card-icon blue"><el-icon><User /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ tableData.length }}</h3>
          <p>用户总数</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon teal"><el-icon><CircleCheck /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ tableData.filter(u => u.status === 1).length }}</h3>
          <p>启用账号</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon amber"><el-icon><Key /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ roleList.length }}</h3>
          <p>可分配角色</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon rose"><el-icon><Warning /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ tableData.filter(u => u.status === 0).length }}</h3>
          <p>已禁用账号</p>
        </div>
      </div>
    </div>

    <!-- 主卡片 -->
    <div class="page-card">
      <div class="page-card-header">
        <div class="page-card-title">
          <el-icon class="icon"><User /></el-icon>
          用户列表
        </div>
      </div>

      <!-- 搜索 & 工具栏 -->
      <div class="toolbar" style="margin-bottom: 16px">
        <el-input v-model="searchKeyword" placeholder="搜索用户名/昵称/手机" clearable style="width: 240px" prefix-icon="Search" />
        <el-select v-model="searchStatus" placeholder="账号状态" clearable style="width: 130px">
          <el-option label="启用" :value="1" />
          <el-option label="禁用" :value="0" />
        </el-select>
        <div class="toolbar-right">
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon> 新增用户
          </el-button>
          <el-button>
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </div>
      </div>

      <!-- 用户表格 -->
      <el-table :data="paginatedData" border stripe style="width: 100%">
        <el-table-column prop="username" label="用户账号" width="120" />
        <el-table-column prop="nickname" label="昵称" width="110">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #2563eb, #7c3aed); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; flex-shrink: 0">
                {{ row.nickname?.slice(0, 1) }}
              </div>
              {{ row.nickname }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="deptName" label="所属部门" min-width="200">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" type="info">{{ row.deptName }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="关联岗位" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="pid in row.postIds" :key="pid" size="small" style="margin: 2px" effect="plain">
              {{ getPostName(pid) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="绑定角色" min-width="140">
          <template #default="{ row }">
            <el-tag v-for="rid in row.roleIds" :key="rid" size="small" type="warning" style="margin: 2px" effect="plain">
              {{ getRoleName(rid) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.status"
              :active-value="1"
              :inactive-value="0"
              :disabled="!isSuperAdmin"
              @change="handleToggleStatus(row)"
              style="--el-switch-on-color: #059669; --el-switch-off-color: #dc2626"
            />
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" width="120" align="center" />
        <el-table-column label="操作" width="200" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="handleEdit(row)" :disabled="!isSuperAdmin">
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-button link type="primary" size="small" @click="handleResetPwd(row)" :disabled="!isSuperAdmin">
              <el-icon><Refresh /></el-icon> 重置
            </el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)" :disabled="!isSuperAdmin">
              <el-icon><Delete /></el-icon> 删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div style="display: flex; justify-content: flex-end; margin-top: 16px">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          background
          layout="total, sizes, prev, pager, next"
          :total="filteredData.length"
          :page-sizes="[10, 20, 50]"
        />
      </div>
    </div>

    <!-- 新增/编辑用户弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="780px" destroy-on-close>
      <div style="display: flex; gap: 20px">
        <!-- 左侧表单 -->
        <div style="flex: 1">
          <el-form ref="formRef" :model="formData" :rules="rules" label-width="90px">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="用户账号" prop="username">
                  <el-input v-model="formData.username" placeholder="请输入" :disabled="isEdit" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="用户昵称" prop="nickname">
                  <el-input v-model="formData.nickname" placeholder="请输入" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="手机号" prop="phone">
                  <el-input v-model="formData.phone" placeholder="请输入" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item prop="email">
                  <template #label>
                    <span class="form-label-with-tip">
                      邮箱
                      <el-tooltip placement="top" effect="dark">
                        <template #content>
                          <div class="email-format-tip">
                            <strong>支持的邮箱格式</strong>
                            <span>常见格式：user@example.com、name.surname@company.com</span>
                            <span>Plus 标签：user+tag@gmail.com</span>
                            <span>多级域名/子域名：user@mail.example.com</span>
                            <span>域名支持字母、数字、连字符和 punycode；暂不支持中文本地名、IP 邮箱或引号邮箱。</span>
                          </div>
                        </template>
                        <button type="button" class="email-format-help" aria-label="查看支持的邮箱格式">?</button>
                      </el-tooltip>
                    </span>
                  </template>
                  <el-input v-model="formData.email" placeholder="例如 user@example.com" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="所属部门" prop="deptIds">
              <el-cascader
                v-model="formData.deptIds"
                :options="deptCascaderOptions"
                :props="{ checkStrictly: true, expandTrigger: 'hover' }"
                placeholder="请选择部门"
                clearable
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="关联岗位">
              <el-select v-model="formData.postIds" multiple placeholder="请选择岗位（选择部门后可选）" style="width: 100%">
                <el-option
                  v-for="p in availablePosts"
                  :key="p.id"
                  :label="p.name"
                  :value="p.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="绑定角色">
              <el-select v-model="formData.roleIds" multiple placeholder="请选择角色" style="width: 100%">
                <el-option
                  v-for="r in roleList"
                  :key="r.id"
                  :label="r.name"
                  :value="r.id"
                />
              </el-select>
            </el-form-item>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="状态">
                  <el-radio-group v-model="formData.status">
                    <el-radio :value="1">启用</el-radio>
                    <el-radio :value="0">禁用</el-radio>
                  </el-radio-group>
                </el-form-item>
              </el-col>
              <el-col :span="12" v-if="!isEdit">
                <el-form-item label="初始密码">
                  <el-input v-model="formData.password" type="password" show-password placeholder="默认 123456" />
                </el-form-item>
              </el-col>
            </el-row>

            <!-- 权限预览开关 -->
            <el-form-item v-if="formData.roleIds.length > 0">
              <el-button text type="primary" @click="showPermPreview = !showPermPreview">
                <el-icon><View /></el-icon>
                {{ showPermPreview ? '收起权限预览' : '查看权限预览' }}
              </el-button>
            </el-form-item>
          </el-form>
        </div>

        <!-- 右侧权限预览 -->
        <div
          v-if="showPermPreview && formData.roleIds.length > 0"
          style="width: 250px; border-left: 1px solid #e2e8f0; padding-left: 16px; max-height: 450px; overflow-y: auto"
        >
          <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px; display: flex; align-items: center; gap: 6px">
            <el-icon style="color: var(--primary-color)"><Lock /></el-icon>
            权限预览
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px">
            已选 {{ formData.roleIds.length }} 个角色，合并权限如下：
          </div>
          <el-tree
            :data="previewPermissions"
            :props="{ children: 'children', label: 'label' }"
            default-expand-all
            :expand-on-click-node="false"
            class="permission-tree"
          >
            <template #default="{ node, data }">
              <span style="font-size: 12px">
                {{ data.label }}
                <span v-if="data.code" style="color: var(--text-muted); font-size: 10px; margin-left: 4px">({{ data.code }})</span>
              </span>
            </template>
          </el-tree>
        </div>
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取 消</el-button>
        <el-button type="primary" @click="handleSubmit">确 定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.form-label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.email-format-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  cursor: help;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.email-format-help:hover,
.email-format-help:focus-visible {
  border-color: #60a5fa;
  background: #dbeafe;
  outline: none;
}

.email-format-tip {
  display: grid;
  max-width: 360px;
  gap: 6px;
  line-height: 1.55;
}

.email-format-tip strong {
  color: #fff;
}
</style>
