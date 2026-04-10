<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/appStore'
import { ElMessage } from 'element-plus'
import axios from 'axios'

interface NavItem {
  path: string
  label: string
  icon: string
  disabled?: boolean
}

interface MdmGroup {
  title: string
  icon: string
  isOpen: boolean
  children: Array<{ path: string; label: string }>
}

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const appReady = ref(false)
const unreadCount = ref(0)

const fetchNotificationCount = async () => {
  try {
    const res = await axios.get('/notifications', { params: { status: 'UNREAD' } })
    const rows = Array.isArray(res.data?.data) ? res.data.data : []
    unreadCount.value = rows.length
  } catch {
    unreadCount.value = 0
  }
}

onMounted(async () => {
  if (route.path !== '/login' && route.path !== '/forgot-password' && localStorage.getItem('accessToken')) {
    try {
      if (!appStore.authLoaded) {
        await appStore.fetchAccessContext()
      }
    } catch {}

    void appStore.fetchSystemData()
    void fetchNotificationCount()
  }
  appReady.value = true
})

const navItems: NavItem[] = [
  { path: '/department', label: '部门管理', icon: 'OfficeBuilding' },
  { path: '/user', label: '用户管理', icon: 'User' },
  { path: '/role', label: '角色管理', icon: 'Key' },
  { path: '/post', label: '岗位管理', icon: 'Stamp' },
  { path: '/permission', label: '权限管理', icon: 'Lock' },
  { path: '/dict-center', label: '字典中心', icon: 'CollectionTag' },
  { path: '/operation-log', label: '操作日志', icon: 'Document' },
  { path: '/import-task', label: '导入任务', icon: 'UploadFilled' },
  { path: '/export-task', label: '导出任务', icon: 'Download' }
]

const businessItems: NavItem[] = [
  { path: '/pasture', label: '牧场概览', icon: 'Van' },
  { path: '/intelligent', label: '智能订购中心', icon: 'Cpu' },
  { path: '/intelligent-closed-loop', label: '订单闭环中心', icon: 'Finished' },
  { path: '/inventory-ops', label: '库存与仓配运营中心', icon: 'Box' }
]

const mdmGroups = ref<MdmGroup[]>([
  {
    title: '商品管理', icon: 'Goods', isOpen: true,
    children: [
      { path: '/mdm/sku', label: 'SKU管理' },
      { path: '/mdm/category', label: '品类管理' }
    ]
  },
  {
    title: '仓库管理', icon: 'HomeFilled', isOpen: false,
    children: [
      { path: '/mdm/warehouse', label: '仓库管理' },
      { path: '/mdm/factory', label: '工厂管理' }
    ]
  },
  {
    title: '渠道管理', icon: 'DataAnalysis', isOpen: false,
    children: [
      { path: '/mdm/channel', label: '渠道管理' },
      { path: '/mdm/reseller', label: '经销商管理' }
    ]
  },
  {
    title: '组织与日历', icon: 'OfficeBuilding', isOpen: false,
    children: [
      { path: '/mdm/org', label: '组织机构' },
      { path: '/mdm/calendar', label: '业务日历' }
    ]
  },
  {
    title: '关系配置', icon: 'Connection', isOpen: false,
    children: [
      { path: '/mdm/rltn/warehouse-sku', label: '仓库-SKU关系' },
      { path: '/mdm/reseller-relation', label: 'SKU-经销关系' },
      { path: '/mdm/rltn/org-reseller', label: '组织-经销关系' },
      { path: '/mdm/rltn/product-sku', label: '产品-SKU转换关系' }
    ]
  },
  {
    title: '治理平台', icon: 'DataBoard', isOpen: false,
    children: [
      { path: '/mdm/governance', label: '主数据治理平台' }
    ]
  }
])

const visibleNavItems = computed(() => appStore.filterNavItems(navItems))
const visibleBusinessItems = computed(() => appStore.filterNavItems(businessItems))
const isSuperAdmin = computed(() => appStore.isSuperAdmin || currentUser.value?.role === '超级管理员')

const visibleMdmGroups = computed(() => {
  if (!isSuperAdmin.value) return []
  return mdmGroups.value
})

const currentTitle = computed(() => {
  const allItems: Array<{ path: string; label: string }> = [...navItems, ...businessItems]
  mdmGroups.value.forEach(group => {
    if (group.children.some(child => child.path === route.path)) {
      group.isOpen = true
    }
    allItems.push(...group.children)
  })

  const current = allItems.find(item => item.path === route.path)
  return current ? current.label : '首页'
})

const currentTime = ref(new Date().toLocaleString('zh-CN'))
setInterval(() => {
  currentTime.value = new Date().toLocaleString('zh-CN')
}, 1000)

const loadUser = () => {
  try {
    const raw = localStorage.getItem('currentUser')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const currentUser = ref(loadUser())

watch(() => route.path, () => {
  currentUser.value = loadUser()
})

const helperCodeDialogVisible = ref(false)
const helperCode = ref('')
const helperCodeLoading = ref(false)

const fetchHelperCode = async () => {
  helperCodeLoading.value = true
  try {
    const res = await axios.get('/admin/helper-code')
    const data = res.data
    if (data.code === 200) {
      helperCode.value = data.data.helperCode
    } else {
      ElMessage.error(data.msg || '获取失败')
    }
  } catch {
    ElMessage.error('网络错误')
  } finally {
    helperCodeLoading.value = false
  }
}

const refreshHelperCode = async () => {
  helperCodeLoading.value = true
  try {
    const res = await axios.post('/admin/refresh-helper-code')
    const data = res.data
    if (data.code === 200) {
      helperCode.value = data.data.helperCode
      ElMessage.success('辅助动态码已刷新')
    } else {
      ElMessage.error(data.msg || '刷新失败')
    }
  } catch {
    ElMessage.error('网络错误')
  } finally {
    helperCodeLoading.value = false
  }
}

const openHelperCodeDialog = () => {
  helperCodeDialogVisible.value = true
  fetchHelperCode()
}

const handleLogout = () => {
  appStore.clearAccessContext()
  localStorage.removeItem('currentUser')
  localStorage.removeItem('accessToken')
  unreadCount.value = 0
  void router.replace('/login')
}
</script>

<template>
  <div v-if="route.path === '/login' || route.path === '/forgot-password'" style="width: 100%; height: 100vh;">
    <router-view />
  </div>

  <div v-else-if="!appReady" style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#94a3b8;font-size:15px;gap:10px">
    <span class="app-spinner"></span>
    系统数据加载中...
  </div>

  <div v-else class="layout-container">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">奶</div>
        <div>
          <div class="sidebar-title">供应链决策平台</div>
          <div class="sidebar-subtitle">认养一头牛 · SCMP</div>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section-title">组织权限</div>
        <router-link
          v-for="item in visibleNavItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: route.path === item.path }"
        >
          <span class="nav-icon">
            <el-icon><component :is="item.icon" /></el-icon>
          </span>
          {{ item.label }}
        </router-link>

        <div class="nav-section-title" style="margin-top: 12px">业务模块</div>
        <router-link
          v-for="item in visibleBusinessItems"
          :key="item.path"
          :to="item.disabled ? '#' : item.path"
          class="nav-item"
          :class="{ active: route.path === item.path }"
          :style="item.disabled ? 'opacity: 0.5; cursor: default' : ''"
        >
          <span class="nav-icon"><el-icon><component :is="item.icon" /></el-icon></span>
          {{ item.label }}
        </router-link>

        <template v-if="isSuperAdmin">
          <div class="nav-section-title" style="margin-top: 12px">主数据管理(MDM)</div>
          <div v-for="group in visibleMdmGroups" :key="group.title" class="nav-group">
            <div class="nav-group-title" @click="group.isOpen = !group.isOpen" :class="{ 'is-open': group.isOpen }">
              <span class="nav-icon"><el-icon><component :is="group.icon" /></el-icon></span>
              <span style="flex: 1">{{ group.title }}</span>
              <span class="nav-arrow" :class="{ 'rotate': group.isOpen }">▾</span>
            </div>
            <div v-show="group.isOpen" class="nav-group-content">
              <router-link
                v-for="item in group.children"
                :key="item.path"
                :to="item.path"
                class="nav-subitem"
                :class="{ active: route.path === item.path }"
              >
                <div class="nav-dot"></div>
                {{ item.label }}
              </router-link>
            </div>
          </div>
        </template>
      </nav>

      <div style="padding: 16px; border-top: 1px solid rgba(255,255,255,0.06);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="topbar-avatar" style="width: 32px; height: 32px; font-size: 12px;">
            {{ currentUser?.nickname?.slice(0,1) || currentUser?.username?.slice(0,1) || '管' }}
          </div>
          <div>
            <div style="color: #e2e8f0; font-size: 13px; font-weight: 500;">{{ currentUser?.nickname || currentUser?.username || '管理员' }}</div>
            <div style="color: #64748b; font-size: 11px;">{{ currentUser?.username || '' }}</div>
          </div>
        </div>
      </div>
    </aside>

    <div class="main-area">
      <header class="topbar">
        <div class="topbar-breadcrumb">
          <el-icon><HomeFilled /></el-icon>
          <span>/</span>
          <span>组织权限</span>
          <span>/</span>
          <span class="current">{{ currentTitle }}</span>
        </div>
        <div class="topbar-actions">
          <span style="font-size: 13px; color: var(--text-secondary)">{{ currentTime }}</span>
          <el-badge :value="unreadCount" :max="99">
            <el-icon :size="20" style="cursor: pointer; color: var(--text-secondary)"><Bell /></el-icon>
          </el-badge>
          <el-dropdown>
            <div class="topbar-avatar">{{ currentUser?.nickname?.slice(0,1) || '用' }}</div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/profile')">个人中心</el-dropdown-item>
                <el-dropdown-item v-if="isSuperAdmin" @click="openHelperCodeDialog">
                  <el-icon style="margin-right:4px"><Key /></el-icon>查看辅助动态码
                </el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content-area">
        <router-view v-slot="{ Component, route }">
          <transition name="fade" mode="out-in">
            <keep-alive max="10">
              <component :is="Component" :key="route.path" />
            </keep-alive>
          </transition>
        </router-view>
      </main>
    </div>
  </div>

  <el-dialog
    v-model="helperCodeDialogVisible"
    title="超级管理员辅助动态码"
    width="400px"
    :close-on-click-modal="false"
    top="30vh"
  >
    <div style="text-align: center; padding: 16px 0">
      <p style="color: #64748b; font-size: 14px; margin-bottom: 20px">
        请将此动态码提供给需要重置密码的用户。<br />使用后建议及时刷新以保证安全。
      </p>
      <div v-if="helperCodeLoading" style="color: #94a3b8; font-size: 14px">加载中...</div>
      <div v-else class="helper-code-display">{{ helperCode }}</div>
    </div>
    <template #footer>
      <el-button @click="helperCodeDialogVisible = false">关闭</el-button>
      <el-button type="warning" :loading="helperCodeLoading" @click="refreshHelperCode">
        <el-icon style="margin-right:4px"><Refresh /></el-icon>刷新生成新码
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.app-spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid #334155;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.helper-code-display {
  font-size: 40px;
  font-weight: 800;
  letter-spacing: 10px;
  color: #4f46e5;
  background: #eef2ff;
  border: 2px dashed #c7d2fe;
  border-radius: 12px;
  padding: 20px 32px;
  display: inline-block;
  font-family: 'Courier New', monospace;
  user-select: all;
}

.nav-group { margin-bottom: 4px; }
.nav-group-title {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  color: #cbd5e1;
  font-size: 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}
.nav-group-title:hover { background: rgba(255, 255, 255, 0.05); color: #fff; }
.nav-group-title.is-open { color: #f8fafc; }
.nav-arrow { font-size: 14px; transition: transform 0.2s ease; opacity: 0.6; }
.nav-arrow.rotate { transform: rotate(180deg); }
.nav-group-content { margin-top: 4px; padding-left: 12px; }
.nav-subitem {
  display: flex;
  align-items: center;
  padding: 8px 16px 8px 24px;
  color: #94a3b8;
  font-size: 13px;
  text-decoration: none;
  border-radius: 8px;
  transition: all 0.2s ease;
  margin-bottom: 2px;
}
.nav-dot { width: 4px; height: 4px; border-radius: 50%; background: #64748b; margin-right: 12px; transition: all 0.2s ease; }
.nav-subitem:hover { color: #f8fafc; background: rgba(255,255,255,0.05); }
.nav-subitem:hover .nav-dot { background: #cbd5e1; }
.nav-subitem.active { color: #fff; background: rgba(59, 130, 246, 0.15); font-weight: 500; }
.nav-subitem.active .nav-dot { background: #3b82f6; box-shadow: 0 0 6px rgba(59,130,246,0.6); }
</style>

