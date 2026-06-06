import { Link, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { Learn } from './pages/Learn';
import { Stats } from './pages/Stats';

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold">📚 Learn English</Link>
          <nav className="text-sm flex gap-4 text-slate-600">
            <Link to="/" className="hover:text-slate-900">首页</Link>
            <Link to="/stats" className="hover:text-slate-900">统计</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/learn/:sessionId" element={<Learn />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </main>
    </div>
  );
}
