import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function resetPasswords() {
  const emails = ['sa@dormy.local', 'occupant@dormy.local']
  const newPassword = 'DormyPassword123!'

  for (const email of emails) {
    console.log(`Searching for user: ${email}`)
    const { data: users, error: listError } = await supabase.auth.admin.listUsers()

    if (listError) {
      console.error(`Error listing users:`, listError)
      return
    }

    const user = users.users.find(u => u.email === email)
    if (!user) {
      console.error(`User ${email} not found`)
      continue
    }

    console.log(`Resetting password for user ${email} (ID: ${user.id})...`)
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    )

    if (updateError) {
      console.error(`Error resetting password for ${email}:`, updateError)
    } else {
      console.log(`Successfully reset password for ${email}`)
    }
  }
}

resetPasswords()
