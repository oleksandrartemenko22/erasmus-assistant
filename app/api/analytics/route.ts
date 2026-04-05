// app/api/analytics/route.ts
import { getAnalytics } from '@/lib/db/feedback'

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  return request.headers.get('x-admin-secret') === secret
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const data = await getAnalytics()
  return Response.json(data)
}
