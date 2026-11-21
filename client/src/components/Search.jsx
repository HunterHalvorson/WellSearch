import './css/Search.css';
import { Search as SearchIcon } from "lucide-react";

function Search({ inputRef, value, onChange, onSubmit }) {
  return (
    <form className="search-container" role="search" onSubmit={onSubmit}>
      <div className="input-container">
        <input
          ref={inputRef}
          className="search-box"
          type="text"
          aria-label="Search question"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button className="search-button" type="submit" aria-label="Search">
          <SearchIcon className="search-icon" size={50} />
        </button>
      </div>
    </form>
  )
}

export default Search
