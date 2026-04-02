// 这个文件是什么作用显示的是什么：这是Vue应用的主入口文件。显示/实现的是：实例化Vue应用，挂载路由、状态管理（Pinia）和其他全局插件。
/**
 * 供应链决策平台 - 主入口文件
 * 初始化 Vue 应用，注册 Element Plus、路由、状态管理
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import axios from 'axios'
import App from './App.vue'
import router from './router'
import './assets/main.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'
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
    if (status === 401) {
      localStorage.removeItem('isAuthenticated')
      localStorage.removeItem('currentUser')
      localStorage.removeItem('accessToken')
      if (router.currentRoute.value.path !== '/login') {
        router.push('/login')
      }
    }
    return Promise.reject(error)
  }
)

const app = createApp(App)

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

app.mount('#app')
