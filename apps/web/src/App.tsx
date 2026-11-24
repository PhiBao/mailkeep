import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Wordmark } from './components/Wordmark.js';
import { Case } from './routes/Case.js';
import { Demo } from './routes/Demo.js';
import { Letter } from './routes/Letter.js';
import { Login } from './routes/Login.js';
import { Mom } from './routes/Mom.js';
import { Proof } from './routes/Proof.js';
import { Shoebox } from './routes/Shoebox.js';
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
        <Route path="/login" element={<Login />} />
        <Route path="/mom" element={<Mom />} />
        <Route path="/proof" element={<Proof />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/demo/cases/:id" element={<Case demo />} />
        <Route path="/demo/letters/:id" element={<Letter demo />} />
        <Route path="/shoebox" element={<Shoebox />} />
        <Route path="/today" element={<Today />} />
        <Route path="/cases/:id" element={<Case />} />
        <Route path="/letters/:id" element={<Letter />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
