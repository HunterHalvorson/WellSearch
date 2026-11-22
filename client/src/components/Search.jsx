import { Search as SearchIcon } from 'lucide-react'
import './css/Search.css'

export default function Search({ inputRef, value, onChange, onSubmit }) {
  return (
    <form className='search-container' onSubmit={onSubmit}>
      <div className='input-container'>
        <input
          ref={inputRef}
          aria-label='Search question'
          className='search-box'
          type='text'
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button className='search-button' type='submit' aria-label='Search'>
          <SearchIcon className='search-icon' size={50} aria-hidden='true' />
        </button>
      </div>
    </form>
  )
}
