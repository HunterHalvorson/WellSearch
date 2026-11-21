import './css/Search.css';
import { Search as SearchIcon } from "lucide-react";

function Search() {
  return (
    <div className = "search-container">
        <div className="input-container">
            <input className = "search-box" type="text" />
            <button className = 'search-button'>
                <SearchIcon className = 'search-icon' size = {50}/>
            </button>
        </div>
    </div>
  )
}

export default Search
