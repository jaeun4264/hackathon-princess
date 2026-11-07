/** 화면 제목 한 줄. */
export function PageHeader({ title }: { title: string }) {
  return (
    <header className="px-4 pb-2 pt-6">
      <h1 className="text-2xl font-bold">{title}</h1>
    </header>
  );
}
