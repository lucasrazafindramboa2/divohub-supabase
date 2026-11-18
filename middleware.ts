import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  const isLogin = request.nextUrl.pathname.startsWith('/login')
  const path = request.nextUrl.pathname
  const isOpen = isLogin || path.startsWith('/auth/') || path.startsWith('/api/auth/') || path.startsWith('/api/stripe/webhook')
  if (!user && !isOpen) return NextResponse.redirect(new URL('/login', request.url))
  if (user && isLogin) return NextResponse.redirect(new URL('/', request.url))
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
