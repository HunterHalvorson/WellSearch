import { Search as SearchIcon } from 'lucide-react'
import './css/Search.css'

export default function Search({ inputRef, value, onChange, onSubmit, large }) {
  return (
    <form className={large ? 'search large' : 'search'} role='search' onSubmit={onSubmit}>
      <input
        ref={inputRef}
        aria-label='Search question'
        className='search-box'
        type='text'
        placeholder='Rod failures in Winter'
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button className='search-button' type='submit'>
        <SearchIcon size={18} aria-hidden='true' />
        <span>Search</span>
      </button>
    </form>
  )
}
