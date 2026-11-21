import './css/Search.css';
import { Search as SearchIcon } from "lucide-react";
import { useState } from 'react';



function Search() {

  const [search, setSearch] = useState('');

  const handleSearch = async () => {

    if (!search.trim()) {
      alert("Please Enter a Valid Search");
    }

    const response = await fetch("http://localhost:8000/search", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: search
      })
    })

    const data = await response.json();
    console.log(data);
  }


  return (
    <div className = "search-container">
        <div className="input-container">
            <input 
              className = "search-box" type="text" 
              value = {search}
              onChange = {(e) => setSearch(e.target.value)}
            />
            <button className = 'search-button'>
                <SearchIcon onClick = {handleSearch} className = 'search-icon' size = {50}/>
            </button>
        </div>
    </div>
  )
}

export default Search
