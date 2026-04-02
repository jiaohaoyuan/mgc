<!-- 这个文件是什么作用显示的是什么：这是权限管理页面。显示/实现的是：系统中各种操作权限的列表和配置界面。 -->
<script setup lang="ts">
/**
 * 权限管理页面
 * 展示完整的权限菜单树，支持查看权限标识符
 */
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/appStore'
import type { PermNode } from '@/data/mockData'

const appStore = useAppStore()
const { permissionTree } = appStore

const searchCode = ref('')
const expandAll = ref(true)
const treeRef = ref()

// 权限检查
const isSuperAdmin = computed(() => {
  try {
    const s = localStorage.getItem('currentUser')
    const user = s ? JSON.parse(s) : null
    return user?.role === '超级管理员'
  } catch { return false }
})

// 统计信息
const stats = computed(() => {
  let modules = 0
  let menus = 0
  let buttons = 0
  function walk(nodes: PermNode[]) {
    for (const n of nodes) {
      if (n.children && n.children.length > 0) {
        if (!n.code) modules++
        else menus++
        walk(n.children)
      } else {
        buttons++
      }
    }
  }
  walk(permissionTree)
  return { modules, menus, buttons, total: modules + menus + buttons }
})


// 过滤树
const filterNode = (value: string, data: PermNode) => {
  if (!value) return true
  return data.label.includes(value) || (data.code && data.code.includes(value))
}

function handleFilter() {
  treeRef.value?.filter(searchCode.value)
}

function handleExpandAll() {
  expandAll.value = !expandAll.value
}

// 获取节点图标颜色
function getNodeStyle(data: PermNode) {
  if (!data.children || data.children.length === 0) {
    return { icon: 'Key', color: '#0d9488' }
  }
  if (data.code) {
    return { icon: 'Menu', color: '#f59e0b' }
  }
  return { icon: 'FolderOpened', color: '#2563eb' }
}
</script>

<template>
  <div>
    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-card-icon blue"><el-icon><Lock /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ stats.total }}</h3>
          <p>权限总数</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon teal"><el-icon><FolderOpened /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ permissionTree.length }}</h3>
          <p>一级模块</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon amber"><el-icon><Menu /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ stats.menus }}</h3>
          <p>菜单权限</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon rose"><el-icon><Key /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ stats.buttons }}</h3>
          <p>按钮权限</p>
        </div>
      </div>
    </div>

    <!-- 主卡片 -->
    <div class="page-card">
      <div class="page-card-header">
        <div class="page-card-title">
          <el-icon class="icon"><Lock /></el-icon>
          权限菜单树
        </div>
        <div class="toolbar">
          <el-input
            v-model="searchCode"
            placeholder="搜索权限名称/标识符"
            clearable
            style="width: 260px"
            prefix-icon="Search"
            @input="handleFilter"
          />
          <el-button @click="handleExpandAll">
            <el-icon><Sort /></el-icon> {{ expandAll ? '收起' : '展开' }}全部
          </el-button>
        </div>
      </div>

      <div style="display: flex; gap: 24px">
        <!-- 权限树 -->
        <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; max-height: 600px; overflow-y: auto">
          <el-tree
            ref="treeRef"
            :data="permissionTree"
            :default-expand-all="expandAll"
            :filter-node-method="filterNode"
            :props="{ children: 'children', label: 'label' }"
            node-key="id"
            class="permission-tree"
          >
            <template #default="{ node, data }">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding-right: 8px">
                <span style="display: flex; align-items: center; gap: 8px; font-size: 13px">
                  <el-icon :style="{ color: getNodeStyle(data).color }">
                    <component :is="getNodeStyle(data).icon" />
                  </el-icon>
                  <span style="font-weight: 500">{{ data.label }}</span>
                </span>
                <span v-if="data.code" style="display: flex; align-items: center; gap: 8px">
                  <el-tag size="small" effect="plain" type="success">{{ data.code }}</el-tag>
                  <el-tag size="small" effect="plain" :type="data.children ? 'warning' : 'info'">
                    {{ data.children ? '菜单' : '按钮' }}
                  </el-tag>
                </span>
                <el-tag v-else size="small" effect="plain" type="danger">模块</el-tag>
              </div>
            </template>
          </el-tree>
        </div>

        <!-- 权限说明卡片 -->
        <div style="width: 280px; flex-shrink: 0">
          <div style="background: linear-gradient(135deg, #eff6ff, #f0fdfa); border-radius: 8px; padding: 20px; margin-bottom: 16px">
            <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px">权限标识符规范</div>
            <div style="font-size: 12px; color: var(--text-secondary); line-height: 2">
              <div><code style="background: #fff; padding: 2px 6px; border-radius: 3px; font-size: 11px">sys:user:edit</code> 系统管理</div>
              <div><code style="background: #fff; padding: 2px 6px; border-radius: 3px; font-size: 11px">sc:plan:adjust</code> 需求计划</div>
              <div><code style="background: #fff; padding: 2px 6px; border-radius: 3px; font-size: 11px">mfg:order:create</code> 生产制造</div>
              <div><code style="background: #fff; padding: 2px 6px; border-radius: 3px; font-size: 11px">cc:temp:monitor</code> 低温冷链</div>
              <div><code style="background: #fff; padding: 2px 6px; border-radius: 3px; font-size: 11px">adopt:card:verify</code> 认养业务</div>
            </div>
          </div>

          <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px">
            <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px">层级说明</div>
            <div style="font-size: 12px; color: var(--text-secondary); line-height: 2.2">
              <div style="display: flex; align-items: center; gap: 8px">
                <el-tag size="small" type="danger" effect="plain">模块</el-tag>
                一级功能分类
              </div>
              <div style="display: flex; align-items: center; gap: 8px">
                <el-tag size="small" type="warning" effect="plain">菜单</el-tag>
                二级功能页面
              </div>
              <div style="display: flex; align-items: center; gap: 8px">
                <el-tag size="small" type="info" effect="plain">按钮</el-tag>
                三级按钮操作
              </div>
            </div>
          </div>

          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-top: 16px">
            <div style="font-size: 12px; color: #92400e; display: flex; align-items: flex-start; gap: 6px">
              <el-icon style="margin-top: 2px"><WarningFilled /></el-icon>
              <span>权限标识符 (Code) 为系统底层使用，修改前请联系系统管理部确认影响范围。</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
