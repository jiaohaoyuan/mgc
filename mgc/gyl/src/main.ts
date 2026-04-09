import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import App from './App.vue'
import router from './router'
import { useAppStore } from './stores/appStore'
import './assets/main.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'
const pinia = createPinia()

axios.defaults.baseURL = API_BASE
axios.defaults.timeout = 15000
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const data = error?.response?.data || {}
    if (status === 401) {
      useAppStore(pinia).clearAccessContext()
      localStorage.removeItem('currentUser')
      localStorage.removeItem('accessToken')
      if (router.currentRoute.value.path !== '/login') {
        void router.replace({
          path: '/login',
          query: router.currentRoute.value.fullPath ? { redirect: router.currentRoute.value.fullPath } : undefined
        })
      }
    } else {
      const msg = data?.msg || '请求失败，请稍后重试'
      ElMessage.error(msg)
    }
    return Promise.reject(error)
  }
)

const app = createApp(App)

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

app.mount('#app')
