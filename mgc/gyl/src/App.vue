<!-- 这个文件是什么作用显示的是什么：这是Vue应用的根组件。显示/实现的是：整个应用的全局布局和路由视图入口。 -->
<script setup lang="ts">
/**
 * 供应链决策平台 - 根布局组件
 * 包含侧边栏导航与主内容区
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/appStore'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const appReady = ref(false)

onMounted(async () => {
  if (route.path !== '/login' && route.path !== '/forgot-password' && localStorage.getItem('accessToken')) {
    try {
      await appStore.fetchSystemData()
    } catch {}
  }
  appReady.value = true
})

const navItems = [
  { path: '/department', label: '部门管理', icon: 'OfficeBuilding' },
  { path: '/user', label: '用户管理', icon: 'User' },
  { path: '/role', label: '角色管理', icon: 'Key' },
  { path: '/post', label: '岗位管理', icon: 'Stamp' },
  { path: '/permission', label: '权限管理', icon: 'Lock' }
]

const businessItems = [
  { path: '/pasture', label: '牧场概览', icon: 'Van', disabled: false },
  { path: '/channels', label: '三级渠道', icon: 'DataAnalysis', disabled: false },
  { path: '/intelligent', label: '智能订购中心', icon: 'Cpu', disabled: false },
  { path: '/categories', label: '品类管理', icon: 'SetUp', disabled: false }
]

const mdmItems = [
  { path: '/mdm/sku', label: 'SKU 管理', icon: 'Goods' },
  { path: '/mdm/reseller-relation', label: '经销关系', icon: 'Connection' }
]

const currentTitle = computed(() => {
  const allItems = [...navItems, ...businessItems, ...mdmItems]
  const item = allItems.find(n => n.path === route.path)
  return item ? item.label : '首页'
})

const currentTime = ref(new Date().toLocaleString('zh-CN'))
setInterval(() => {
  currentTime.value = new Date().toLocaleString('zh-CN')
}, 1000)

// 获取当前登录用户信息（用 ref 确保响应式，路由变化时同步刷新）
const loadUser = () => {
  try {
    const s = localStorage.getItem('currentUser')
    return s ? JSON.parse(s) : null
  } catch { return null }
}
const currentUser = ref(loadUser())

// 每次路由跳转都重新读取一次（解决登录后 localStorage 更新但视图不刷新问题）
watch(() => route.path, () => {
  currentUser.value = loadUser()
})

const isSuperAdmin = computed(() => currentUser.value?.role === '超级管理员')

// 辅助动态码弹窗
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
  localStorage.removeItem('isAuthenticated')
  localStorage.removeItem('currentUser')
  localStorage.removeItem('accessToken')
  router.push('/login')
}
</script>

<template>
  <div v-if="route.path === '/login' || route.path === '/forgot-password'" style="width: 100%; height: 100vh;">
    <!-- 独立渲染登录/忘记密码页 -->
    <router-view />
  </div>

  <!-- 数据加载中 -->
  <div v-else-if="!appReady" style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#94a3b8;font-size:15px;gap:10px">
    <span class="app-spinner"></span>
    系统数据加载中…
  </div>

  <div v-else class="layout-container">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">供</div>
        <div>
          <div class="sidebar-title">供应链决策平台</div>
          <div class="sidebar-subtitle">认养一头牛 · SCMP</div>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section-title">组织权限</div>
        <router-link
          v-for="item in navItems"
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
          v-for="item in businessItems"
          :key="item.path"
          :to="item.disabled ? '#' : item.path"
          class="nav-item"
          :class="{ active: route.path === item.path }"
          :style="item.disabled ? 'opacity: 0.5; cursor: default' : ''"
        >
          <span class="nav-icon"><el-icon><component :is="item.icon" /></el-icon></span>
          {{ item.label }}
        </router-link>

        <div class="nav-section-title" style="margin-top: 12px">主数据管理 (MDM)</div>
        <router-link
          v-for="item in mdmItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: route.path === item.path }"
        >
          <span class="nav-icon"><el-icon><component :is="item.icon" /></el-icon></span>
          {{ item.label }}
        </router-link>
      </nav>

      <!-- 底部信息 -->
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

    <!-- 主区域 -->
    <div class="main-area">
      <!-- 顶部导航栏 -->
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
          <el-badge :value="3" :max="99">
            <el-icon :size="20" style="cursor: pointer; color: var(--text-secondary)"><Bell /></el-icon>
          </el-badge>
          <el-dropdown>
            <div class="topbar-avatar">{{ currentUser?.nickname?.slice(0,1) || '焦' }}</div>
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

      <!-- 内容区 -->
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

  <!-- 超级管理员辅助动态码弹窗 -->
  <el-dialog
    v-model="helperCodeDialogVisible"
    title="超级管理员辅助动态码"
    width="400px"
    :close-on-click-modal="false"
    top="30vh"
  >
    <div style="text-align: center; padding: 16px 0">
      <p style="color: #64748b; font-size: 14px; margin-bottom: 20px">
        将此动态码提供给需要重置密码的用户，<br />使用后建议及时刷新以保证安全。
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
</style>
