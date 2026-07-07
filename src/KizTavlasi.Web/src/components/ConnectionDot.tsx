export default function ConnectionDot({ isConnected }: { isConnected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        aria-hidden="true"
        className={`block h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-bordo-500'}`}
      />
      <span className={isConnected ? 'text-emerald-400' : 'text-rose-400'}>
        {isConnected ? 'Bağlı' : 'Çevrimdışı'}
      </span>
    </span>
  );
}
