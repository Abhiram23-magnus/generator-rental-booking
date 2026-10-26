import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="font-wide text-6xl font-black text-amber">404</p>
      <h1 className="mt-4 text-2xl font-bold">This page does not exist</h1>
      <p className="mt-2 text-steel">The link may be old or mistyped.</p>
      <Link to="/" className="btn-amber mt-6">Back to Home</Link>
    </div>
  )
}
