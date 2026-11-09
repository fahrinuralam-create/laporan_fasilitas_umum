export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-zinc-900">403</h1>
        <p className="text-zinc-600 mt-2">
          Anda tidak memiliki akses ke halaman ini
        </p>
      </div>
    </div>
  );
}
