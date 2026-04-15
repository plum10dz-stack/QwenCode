<script setup>
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSupabaseAuth } from '@/composables/useSupabaseAuth.js'
import { useNotify } from '@/composables/useNotify.js'

const router   = useRouter()
const route    = useRoute()
const { signIn, loading, error } = useSupabaseAuth()
const { notify } = useNotify()

const form  = reactive({ email: '', password: '', mfaCode: '' })
const mfaRequired = ref(false)
const isOffline   = !import.meta.env.VITE_SUPABASE_URL

async function handleLogin() {
  const ok = await signIn({
    email:    form.email,
    password: form.password,
    mfaCode:  form.mfaCode || undefined,
  })
  if (ok) {
    notify.success('Signed in successfully')
    const redirect = route.query.redirect || '/dashboard'
    router.replace(redirect)
  } else {
    if (error.value?.toLowerCase().includes('mfa')) mfaRequired.value = true
    else notify.error(error.value || 'Login failed')
  }
}
</script>

<template>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:24px">
    <div class="card" style="width:100%;max-width:400px;padding:40px">

      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="font-display font-bold" style="font-size:32px;color:var(--text)">
          Stock<span style="color:var(--accent)">OS</span>
        </div>
        <div style="font-size:13px;color:var(--text3);margin-top:6px;font-family:'DM Mono',monospace">
          ERP · DZD Workspace
        </div>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleLogin" class="space-y-4">
        <div class="input-wrap">
          <label>Email</label>
          <input
            class="input" type="email" v-model="form.email"
            placeholder="admin@yourcompany.dz" autocomplete="email" required/>
        </div>

        <div class="input-wrap">
          <label>Password</label>
          <input
            class="input" type="password" v-model="form.password"
            placeholder="••••••••" autocomplete="current-password" required/>
        </div>

        <div v-if="mfaRequired" class="input-wrap">
          <label>MFA Code</label>
          <input
            class="input font-mono" type="text" v-model="form.mfaCode"
            placeholder="000000" maxlength="6" autocomplete="one-time-code"/>
        </div>

        <button
          type="submit"
          class="btn btn-primary w-full"
          style="width:100%;padding:11px;font-size:14px;margin-top:8px"
          :disabled="loading">
          <span v-if="loading" style="display:inline-flex;align-items:center;gap:8px">
            <svg style="animation:spin .7s linear infinite;width:14px;height:14px" viewBox="0 0 24 24"
              fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-width="2.5" d="M12 2a10 10 0 0 1 10 10"/>
            </svg>
            Signing in…
          </span>
          <span v-else>Sign In</span>
        </button>
      </form>

      <!-- Offline note -->
      <p v-if="isOffline" style="margin-top:20px;font-size:12px;color:var(--text3);text-align:center">
        Running in <b>offline / local</b> mode — no server configured.
      </p>

    </div>
  </div>
</template>

<style scoped>
@keyframes spin { to { transform: rotate(360deg); } }
</style>
