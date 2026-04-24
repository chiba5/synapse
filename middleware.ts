import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };

export async function middleware(req: NextRequest) {
  if (process.env.NODE_ENV === 'development') {
    const devEmail = process.env.DEV_USER_EMAIL ?? 'dev@example.com';
    const res = NextResponse.next();
    res.headers.set('x-user-email', devEmail);
    return res;
  }

  const token = req.headers.get('cf-access-jwt-assertion');
  if (!token) {
    return new NextResponse('Unauthorized', { status: 403 });
  }

  const teamDomain = process.env.TEAM_DOMAIN!;
  const audience = process.env.ACCESS_AUD!;

  try {
    const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, jwks, { audience: audience });
    const email = payload.email as string | undefined;
    if (!email) return new NextResponse('Unauthorized', { status: 403 });

    const res = NextResponse.next();
    res.headers.set('x-user-email', email);
    return res;
  } catch {
    return new NextResponse('Unauthorized', { status: 403 });
  }
}
