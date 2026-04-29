<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/appStore'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import {
  SIDEBAR_ROOT_ONLY_ONE_OPEN,
  webSidebarConfig,
  type SidebarMenuGroup,
  type SidebarMenuItem,
  type SidebarSection
} from '@/data/webSidebarConfig'

interface VisibleSidebarGroup extends Omit<SidebarMenuGroup, 'children'> {
  isOpen: boolean
  children: SidebarMenuItem[]
}

interface VisibleSidebarSection extends Omit<SidebarSection, 'children'> {
  isOpen: boolean
  children: Array<SidebarMenuItem | VisibleSidebarGroup>
}

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const appReady = ref(false)
const unreadCount = ref(0)
const AUTH_ROUTE_SET = new Set(['/login', '/forgot-password'])
const sectionOpenState = ref<Record<string, boolean>>({})
const groupOpenState = ref<Record<string, boolean>>({})
const sidebarNavRef = ref<HTMLElement | null>(null)
const isRouteChanging = ref(false)
const pendingNavigationPath = ref('')
let navigationFeedbackTimer: number | undefined
let removeRouteBeforeEach: (() => void) | undefined
let removeRouteAfterEach: (() => void) | undefined
let removeRouteErrorHandler: (() => void) | undefined

const COMMON_ROUTE_PRELOADERS: Array<() => Promise<unknown>> = [
  () => import('@/views/WorkflowCenter.vue'),
  () => import('@/views/ManagementCockpit.vue'),
  () => import('@/views/IntelligentOrdering.vue'),
  () => import('@/views/InventoryOpsCenter.vue'),
  () => import('@/views/ChannelDealerOpsCenter.vue'),
  () => import('@/views/OrderClosedLoopCenter.vue'),
  () => import('@/views/PastureOverview.vue'),
  () => import('@/views/DictCenter.vue'),
  () => import('@/views/PlatformAuditLogPage.vue'),
  () => import('@/views/PlatformSecurityCenterPage.vue'),
  () => import('@/views/PlatformConfigCenterPage.vue'),
  () => import('@/views/PlatformArchiveStrategyPage.vue'),
  () => import('@/views/PlatformMonitorPage.vue'),
  () => import('@/views/PlatformFinePermissionPage.vue'),
  () => import('@/views/PlatformHealthViewPage.vue')
]

let chunksWarmedUp = false

const runWhenIdle = (task: () => void, timeout = 2500) => {
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number
  }
  if (typeof win.requestIdleCallback === 'function') {
    win.requestIdleCallback(() => task(), { timeout })
    return
  }
  window.setTimeout(task, 600)
}

const warmupCommonRouteChunks = () => {
  if (chunksWarmedUp) return
  chunksWarmedUp = true

  runWhenIdle(async () => {
    for (let i = 0; i < COMMON_ROUTE_PRELOADERS.length; i += 1) {
      const preload = COMMON_ROUTE_PRELOADERS[i]
      if (!preload) continue
      try {
        await preload()
      } catch {}
      if (i < COMMON_ROUTE_PRELOADERS.length - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 120))
      }
    }
  })
}

const tryTriggerChunkWarmup = () => {
  if (!localStorage.getItem('accessToken')) return
  if (AUTH_ROUTE_SET.has(route.path)) return
  warmupCommonRouteChunks()
}

const fetchNotificationCount = async () => {
  try {
    const res = await axios.get('/notifications', { params: { status: 'UNREAD' } })
    const rows = Array.isArray(res.data?.data) ? res.data.data : []
    unreadCount.value = rows.length
  } catch {
    unreadCount.value = 0
  }
}

const loadUser = () => {
  try {
    const raw = localStorage.getItem('currentUser')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const currentUser = ref(loadUser())
const isSuperAdmin = computed(() => appStore.isSuperAdmin || currentUser.value?.role === '超级管理员')

const hasSuperAdminAccess = (requiresSuperAdmin?: boolean) => {
  return !requiresSuperAdmin || isSuperAdmin.value
}

const isConfigGroup = (node: SidebarMenuItem | SidebarMenuGroup): node is SidebarMenuGroup => {
  return node.type === 'group'
}

const canAccessItem = (item: SidebarMenuItem) => {
  return hasSuperAdminAccess(item.requiresSuperAdmin) && appStore.canAccessPath(item.path)
}

for (const section of webSidebarConfig) {
  sectionOpenState.value[section.id] = section.defaultOpen !== false
  for (const child of section.children) {
    if (isConfigGroup(child)) {
      groupOpenState.value[child.id] = Boolean(child.defaultOpen)
    }
  }
}

const visibleSidebarSections = computed<VisibleSidebarSection[]>(() => {
  return webSidebarConfig
    .map((section) => {
      if (!hasSuperAdminAccess(section.requiresSuperAdmin)) return null

      const visibleChildren: Array<SidebarMenuItem | VisibleSidebarGroup> = []
      for (const child of section.children) {
        if (isConfigGroup(child)) {
          if (!hasSuperAdminAccess(child.requiresSuperAdmin)) continue
          const groupChildren = child.children.filter(canAccessItem)
          if (!groupChildren.length) continue
          visibleChildren.push({
            ...child,
            children: groupChildren,
            isOpen: Boolean(groupOpenState.value[child.id])
          })
          continue
        }

        if (canAccessItem(child)) {
          visibleChildren.push(child)
        }
      }

      if (!visibleChildren.length) return null
      return {
        ...section,
        children: visibleChildren,
        isOpen: Boolean(sectionOpenState.value[section.id])
      }
    })
    .filter((section): section is VisibleSidebarSection => Boolean(section))
})

const routeLabelMap = computed(() => {
  const map = new Map<string, string>()
  for (const section of visibleSidebarSections.value) {
    for (const child of section.children) {
      if (child.type === 'group') {
        for (const item of child.children) {
          map.set(item.path, item.label)
        }
      } else {
        map.set(child.path, child.label)
      }
    }
  }
  return map
})

const findRouteLocation = (path: string) => {
  for (const section of visibleSidebarSections.value) {
    for (const child of section.children) {
      if (child.type === 'group') {
        const matched = child.children.find((item) => item.path === path)
        if (matched) {
          return { sectionTitle: section.title, itemLabel: matched.label }
        }
      } else if (child.path === path) {
        return { sectionTitle: section.title, itemLabel: child.label }
      }
    }
  }
  return null
}

const currentTitle = computed(() => routeLabelMap.value.get(route.path) || '首页')
const currentSectionTitle = computed(() => findRouteLocation(route.path)?.sectionTitle || '工作台')

const ensureOpenStateForRoute = (path: string) => {
  let matchedSectionId = ''
  let matchedGroupId = ''

  for (const section of webSidebarConfig) {
    if (!hasSuperAdminAccess(section.requiresSuperAdmin)) continue

    let sectionMatched = false
    for (const child of section.children) {
      if (isConfigGroup(child)) {
        if (!hasSuperAdminAccess(child.requiresSuperAdmin)) continue
        const matched = child.children.find((item) => item.path === path && canAccessItem(item))
        if (matched) {
          sectionMatched = true
          matchedGroupId = child.id
          break
        }
      } else if (child.path === path && canAccessItem(child)) {
        sectionMatched = true
      }
    }

    if (sectionMatched) {
      matchedSectionId = section.id
      break
    }
  }

  if (!matchedSectionId) return

  if (SIDEBAR_ROOT_ONLY_ONE_OPEN) {
    for (const id of Object.keys(sectionOpenState.value)) {
      sectionOpenState.value[id] = id === matchedSectionId
    }
  } else {
    sectionOpenState.value[matchedSectionId] = true
  }

  if (matchedGroupId) {
    groupOpenState.value[matchedGroupId] = true
  }
}

const toggleSection = (sectionId: string) => {
  const nextOpen = !sectionOpenState.value[sectionId]
  if (SIDEBAR_ROOT_ONLY_ONE_OPEN && nextOpen) {
    for (const id of Object.keys(sectionOpenState.value)) {
      sectionOpenState.value[id] = id === sectionId
    }
    return
  }
  sectionOpenState.value[sectionId] = nextOpen
}

const toggleGroup = (groupId: string) => {
  groupOpenState.value[groupId] = !groupOpenState.value[groupId]
}

const clearNavigationFeedback = (delay = 120) => {
  if (navigationFeedbackTimer) {
    window.clearTimeout(navigationFeedbackTimer)
  }

  navigationFeedbackTimer = window.setTimeout(() => {
    isRouteChanging.value = false
    pendingNavigationPath.value = ''
  }, delay)
}

const preloadRouteComponent = (path: string) => {
  const matched = router.getRoutes().find((record) => record.path === path)
  const component = matched?.components?.default as unknown
  if (typeof component !== 'function') return

  void Promise.resolve(component()).catch(() => {})
}

const shouldUseNativeNavigation = (event?: MouseEvent) => {
  return Boolean(event?.button || event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey)
}

const navigateTo = async (path: string, event?: MouseEvent) => {
  if (shouldUseNativeNavigation(event)) return
  event?.preventDefault()

  if (!path || path === route.path) {
    ensureOpenStateForRoute(route.path)
    void scrollActiveParentIntoView()
    ElMessage.info('已在当前页面')
    return
  }

  pendingNavigationPath.value = path
  isRouteChanging.value = true

  try {
    const failure = await router.push(path)
    if (failure) {
      clearNavigationFeedback(0)
      return
    }
  } catch {
    ElMessage.error('页面跳转失败，请稍后重试')
  } finally {
    clearNavigationFeedback()
  }
}

const scrollActiveParentIntoView = async () => {
  if (!appReady.value) return
  await nextTick()

  const nav = sidebarNavRef.value
  if (!nav) return

  const activeItem = nav.querySelector('.nav-subitem.active, .nav-item.active') as HTMLElement | null
  if (!activeItem) return

  const parentGroupTitle = activeItem.closest('.nav-group')?.querySelector('.nav-group-title') as HTMLElement | null
  const parentSectionTitle = activeItem.closest('.nav-section')?.querySelector('.nav-section-header') as HTMLElement | null
  const target = parentGroupTitle || parentSectionTitle || activeItem

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: 'nearest'
  })
}

onMounted(async () => {
  removeRouteBeforeEach = router.beforeEach((to, from) => {
    if (to.fullPath !== from.fullPath) {
      isRouteChanging.value = true
      pendingNavigationPath.value = to.path
    }
    return true
  })
  removeRouteAfterEach = router.afterEach(() => {
    clearNavigationFeedback()
  })
  removeRouteErrorHandler = router.onError(() => {
    clearNavigationFeedback(0)
  })

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
  tryTriggerChunkWarmup()
  ensureOpenStateForRoute(route.path)
  void scrollActiveParentIntoView()
})

const currentTime = ref(new Date().toLocaleString('zh-CN'))
const clockTimer = setInterval(() => {
  currentTime.value = new Date().toLocaleString('zh-CN')
}, 1000)

watch(() => route.path, () => {
  currentUser.value = loadUser()
  tryTriggerChunkWarmup()
  ensureOpenStateForRoute(route.path)
  void scrollActiveParentIntoView()
}, { immediate: true })

const permissionSignature = computed(() => appStore.authContext.permissionPaths.join('|'))
watch(() => [permissionSignature.value, isSuperAdmin.value], () => {
  ensureOpenStateForRoute(route.path)
  void scrollActiveParentIntoView()
}, { immediate: true })

onBeforeUnmount(() => {
  clearInterval(clockTimer)
  if (navigationFeedbackTimer) window.clearTimeout(navigationFeedbackTimer)
  removeRouteBeforeEach?.()
  removeRouteAfterEach?.()
  removeRouteErrorHandler?.()
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
    <div v-if="isRouteChanging" class="route-progress"></div>
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">奶</div>
        <div>
          <div class="sidebar-title">供应链决策平台</div>
          <div class="sidebar-subtitle">认养一头牛 · SCMP</div>
        </div>
      </div>

      <nav ref="sidebarNavRef" class="sidebar-nav">
        <div v-for="section in visibleSidebarSections" :key="section.id" class="nav-section">
          <div class="nav-section-header" :class="{ 'is-open': section.isOpen }" @click="toggleSection(section.id)">
            <span class="nav-icon"><el-icon><component :is="section.icon" /></el-icon></span>
            <span style="flex: 1">{{ section.title }}</span>
            <span class="nav-arrow" :class="{ rotate: section.isOpen }">▾</span>
          </div>

          <div v-show="section.isOpen" class="nav-section-content">
            <template v-for="child in section.children" :key="child.id">
              <div v-if="child.type === 'group'" class="nav-group">
                <div class="nav-group-title" @click="toggleGroup(child.id)" :class="{ 'is-open': child.isOpen }">
                  <span class="nav-icon"><el-icon><component :is="child.icon" /></el-icon></span>
                  <span style="flex: 1">{{ child.title }}</span>
                  <span class="nav-arrow" :class="{ rotate: child.isOpen }">▾</span>
                </div>
                <div v-show="child.isOpen" class="nav-group-content">
                  <router-link
                    v-for="item in child.children"
                    :key="item.path"
                    :to="item.path"
                    custom
                    v-slot="{ href }"
                  >
                    <a
                      :href="href"
                      class="nav-subitem"
                      :class="{ active: route.path === item.path, pending: pendingNavigationPath === item.path }"
                      @click="navigateTo(item.path, $event)"
                      @pointerenter="preloadRouteComponent(item.path)"
                    >
                      <div class="nav-dot"></div>
                      {{ item.label }}
                    </a>
                  </router-link>
                </div>
              </div>

              <router-link
                v-else
                :to="child.path"
                custom
                v-slot="{ href }"
              >
                <a
                  :href="href"
                  class="nav-item"
                  :class="{ active: route.path === child.path, pending: pendingNavigationPath === child.path }"
                  @click="navigateTo(child.path, $event)"
                  @pointerenter="preloadRouteComponent(child.path)"
                >
                  <span class="nav-icon"><el-icon><component :is="child.icon" /></el-icon></span>
                  {{ child.label }}
                </a>
              </router-link>
            </template>
          </div>
        </div>
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
          <span>{{ currentSectionTitle }}</span>
          <span>/</span>
          <span class="current">{{ currentTitle }}</span>
        </div>
        <div class="topbar-actions">
          <span style="font-size: 13px; color: var(--text-secondary)">{{ currentTime }}</span>
          <el-badge :value="unreadCount" :max="99">
            <el-icon :size="20" style="cursor: pointer; color: var(--text-secondary)" @click="navigateTo('/workflow-center')"><Bell /></el-icon>
          </el-badge>
          <el-dropdown>
            <div class="topbar-avatar">{{ currentUser?.nickname?.slice(0,1) || '用' }}</div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="navigateTo('/profile')">个人中心</el-dropdown-item>
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
          <transition name="fade">
            <keep-alive max="20">
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

.route-progress {
  position: fixed;
  top: 0;
  left: 240px;
  right: 0;
  height: 3px;
  z-index: 1000;
  overflow: hidden;
  background: rgba(37, 99, 235, 0.12);
}

.route-progress::before {
  content: '';
  position: absolute;
  inset: 0;
  width: 45%;
  background: linear-gradient(90deg, transparent, #3b82f6, transparent);
  animation: routeProgress 0.9s ease-in-out infinite;
}

@keyframes routeProgress {
  from { transform: translateX(-120%); }
  to { transform: translateX(260%); }
}

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

.nav-section { margin-bottom: 6px; }
.nav-section-header {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  letter-spacing: 0.2px;
  user-select: none;
}
.nav-section-header:hover { background: rgba(255,255,255,0.04); color: #e2e8f0; }
.nav-section-header.is-open { color: #f8fafc; }
.nav-section-content { margin-top: 4px; }
.nav-section-content .nav-item,
.nav-section-content .nav-group { margin-left: 8px; }

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
.nav-item.pending,
.nav-subitem.pending {
  color: #fff;
  background: rgba(13, 148, 136, 0.18);
  pointer-events: none;
}

.nav-item.pending .nav-icon,
.nav-subitem.pending .nav-dot {
  opacity: 0.72;
}
</style>
