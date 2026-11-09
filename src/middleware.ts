import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/unauthorized"];

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const role = token?.role as string | undefined;
    const pathname = req.nextUrl.pathname;

    // Halaman admin hanya untuk role ADMIN
    if (pathname.startsWith("/admin") && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }

    // Halaman petugas hanya untuk role PETUGAS atau ADMIN
    if (
      pathname.startsWith("/petugas") &&
      role !== "PETUGAS" &&
      role !== "ADMIN"
    ) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }

    // Jika sudah login dan akses halaman login/register, redirect ke dashboard
    if ((pathname === "/login" || pathname === "/register") && token) {
      if (role === "ADMIN") {
        return NextResponse.redirect(new URL("/admin/dashboard", req.url));
      }
      if (role === "PETUGAS") {
        return NextResponse.redirect(new URL("/petugas/dashboard", req.url));
      }
      return NextResponse.redirect(new URL("/masyarakat/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Halaman publik boleh diakses tanpa login; sisanya wajib login.
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;
        if (PUBLIC_PATHS.includes(pathname)) {
          return true;
        }
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/admin/:path*",
    "/petugas/:path*",
    "/masyarakat/:path*",
    "/login",
    "/register",
    "/unauthorized",
  ],
};
