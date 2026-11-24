import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Wordmark } from './components/Wordmark.js';
import { Today } from './routes/Today.js';

function Home() {
  return (
    <main className="page home">
      <header className="home__header">
        <Wordmark />
      </header>
      <section className="home__intro" aria-labelledby="home-title">
        <p className="eyebrow">Family mail, kept</p>
        <h1 id="home-title">
          Mailkeep remembers every letter Mom gets, and notices when the second notice arrives.
        </h1>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/today" element={<Today />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
