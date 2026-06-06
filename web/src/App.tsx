import { Link, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { Learn } from './pages/Learn';
import { Stats } from './pages/Stats';

export default function App() {
  return (
    <div className="min-h-screen safe-pt safe-pb">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold">📚 Learn English</Link>
          <nav className="text-sm flex gap-4 text-slate-600">
            <Link to="/" className="hover:text-slate-900">首页</Link>
            <Link to="/stats" className="hover:text-slate-900">统计</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-4 sm:py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/learn/:sessionId" element={<Learn />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </main>
    </div>
  );
}
