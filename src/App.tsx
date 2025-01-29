import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Film, Info, Popcorn, Clapperboard, HelpCircle } from 'lucide-react';
import axios from 'axios';

type Message = {
  text: string;
  isBot: boolean;
};

// TMDB API configuration
const TMDB_API_KEY = 'f81980ff410e46f422d64ddf3a56dddd';
const TMDB_API = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  params: {
    api_key: TMDB_API_KEY,
  },
});

// OMDB API configuration (free tier)
const OMDB_API_KEY = '756abb2f';
const OMDB_API = axios.create({
  baseURL: 'https://www.omdbapi.com',
  params: {
    apikey: OMDB_API_KEY,
  },
});

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 30,
  timeWindow: 10000,
  requests: [] as number[],
};

// Language mapping
const LANGUAGE_CODES = {
  hindi: 'hi',
  english: 'en',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
  japanese: 'ja',
  korean: 'ko',
  chinese: 'zh',
  russian: 'ru',
} as const;

// Rate limiting function
const checkRateLimit = () => {
  const now = Date.now();
  RATE_LIMIT.requests = RATE_LIMIT.requests.filter(
    timestamp => now - timestamp < RATE_LIMIT.timeWindow
  );
  
  if (RATE_LIMIT.requests.length >= RATE_LIMIT.maxRequests) {
    const oldestRequest = RATE_LIMIT.requests[0];
    const timeToWait = RATE_LIMIT.timeWindow - (now - oldestRequest);
    throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(timeToWait / 1000)} seconds.`);
  }
  
  RATE_LIMIT.requests.push(now);
  return true;
};

// Cached responses
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000;

const getCachedData = async (url: string, params: any = {}, api: typeof TMDB_API | typeof OMDB_API = TMDB_API) => {
  const cacheKey = JSON.stringify({ url, params });
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  checkRateLimit();
  const response = await api.get(url, { params });
  cache.set(cacheKey, { data: response.data, timestamp: now });
  return response.data;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      text: "Hi! I'm your movie recommendation bot. How can I help you today? You can ask about movies in different languages, genres, or search for specific titles!",
      isBot: true
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getRemainingRequests = () => {
    const now = Date.now();
    const activeRequests = RATE_LIMIT.requests.filter(
      timestamp => now - timestamp < RATE_LIMIT.timeWindow
    ).length;
    return RATE_LIMIT.maxRequests - activeRequests;
  };

  const getMovieDetails = async (movieId: string) => {
    try {
      const details = await getCachedData(`/movie/${movieId}`);
      const imdbId = details.imdb_id;
      if (imdbId) {
        const omdbData = await getCachedData('/', { i: imdbId }, OMDB_API);
        return omdbData;
      }
    } catch (error) {
      console.error('Error fetching movie details:', error);
    }
    return null;
  };

  const generateResponse = async (userInput: string) => {
    const lowercaseInput = userInput.toLowerCase();
    
    try {
      // Greetings
      if (lowercaseInput.includes('hi') || lowercaseInput.includes('hello')) {
        return "Hello! I'm here to help you discover great movies! You can ask about:\n" +
               "1. Movies in specific languages (e.g., 'Show Hindi movies')\n" +
               "2. Movie recommendations by genre\n" +
               "3. Search for specific movies\n" +
               "4. Get detailed movie information\n" +
               "5. Find popular movies";
      }

      // Help
      if (lowercaseInput.includes('help')) {
        return "I can help you with:\n" +
               "1. Language-specific movies (e.g., 'Show Korean movies')\n" +
               "2. Genre recommendations (e.g., 'Show action movies')\n" +
               "3. Movie search (e.g., 'Search Inception')\n" +
               "4. Popular movies (e.g., 'Show popular movies')\n" +
               "5. Detailed movie information\n\n" +
               "Supported languages: English, Hindi, Spanish, French, German, Italian, Japanese, Korean, Chinese, Russian";
      }

      // Language-based recommendations
      for (const [language, code] of Object.entries(LANGUAGE_CODES)) {
        if (lowercaseInput.includes(language)) {
          const data = await getCachedData('/discover/movie', {
            with_original_language: code,
            sort_by: 'popularity.desc'
          });
          const movies = data.results.slice(0, 5);
          return `Here are some popular ${language} movies:\n${movies.map((m: any) => 
            `• ${m.title} (${m.release_date.split('-')[0]}) - Rating: ${m.vote_average}/10`).join('\n')}`;
        }
      }

      // Popular movies
      if (lowercaseInput.includes('popular')) {
        const data = await getCachedData('/movie/popular');
        const movies = data.results.slice(0, 5);
        return `Here are some popular movies right now:\n${movies.map((m: any) => 
          `• ${m.title} (${m.release_date.split('-')[0]}) - Rating: ${m.vote_average}/10`).join('\n')}`;
      }

      // Genre specific recommendations
      const genres = ['action', 'comedy', 'drama', 'horror', 'sci-fi', 'romance', 'thriller'];
      for (const genre of genres) {
        if (lowercaseInput.includes(genre)) {
          const genreData = await getCachedData('/genre/movie/list');
          const genreId = genreData.genres.find((g: any) => 
            g.name.toLowerCase().includes(genre)
          )?.id;

          if (genreId) {
            const moviesData = await getCachedData('/discover/movie', {
              with_genres: genreId,
              sort_by: 'popularity.desc'
            });
            const movies = moviesData.results.slice(0, 5);
            return `Here are some popular ${genre} movies:\n${movies.map((m: any) => 
              `• ${m.title} (${m.release_date.split('-')[0]}) - Rating: ${m.vote_average}/10`).join('\n')}`;
          }
        }
      }

      // Movie search with detailed info
      if (lowercaseInput.includes('search')) {
        const searchQuery = userInput.replace(/search/i, '').trim();
        if (searchQuery) {
          const data = await getCachedData('/search/movie', { query: searchQuery });
          const movies = data.results.slice(0, 3);
          
          if (movies.length > 0) {
            let response = `Here's what I found for "${searchQuery}":\n\n`;
            
            for (const movie of movies) {
              const details = await getMovieDetails(movie.id);
              if (details) {
                response += `• ${movie.title} (${movie.release_date?.split('-')[0] || 'N/A'})\n` +
                           `  Rating: ${movie.vote_average}/10\n` +
                           `  Director: ${details.Director}\n` +
                           `  Cast: ${details.Actors}\n` +
                           `  Plot: ${details.Plot}\n\n`;
              } else {
                response += `• ${movie.title} (${movie.release_date?.split('-')[0] || 'N/A'})\n` +
                           `  Rating: ${movie.vote_average}/10\n\n`;
              }
            }
            return response.trim();
          }
          return `Sorry, I couldn't find any movies matching "${searchQuery}".`;
        }
      }

      return "I'm not sure what you're looking for. Try asking for movie recommendations by language (e.g., 'Show Hindi movies'), genre, or search for specific movies. Type 'help' to see all options!";
    } catch (error) {
      if (error instanceof Error && error.message.includes('Rate limit exceeded')) {
        return error.message;
      }
      return "Sorry, I encountered an error. Please try again later.";
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { text: input, isBot: false };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    try {
      const response = await generateResponse(input);
      setTimeout(() => {
        setMessages(prev => [...prev, { text: response, isBot: true }]);
        setIsTyping(false);
      }, 500);
    } catch (error) {
      setMessages(prev => [...prev, { text: "Sorry, I encountered an error. Please try again.", isBot: true }]);
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div 
        className="glass-effect rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-white/20"
        style={{ height: '85vh' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-6">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2 rounded-lg">
              <Film className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Movie Recommendation Bot</h1>
              <p className="text-indigo-200 text-sm mt-1">Your personal movie guide</p>
            </div>
          </div>
          
          {/* Stats and Info */}
          <div className="mt-4 flex gap-4">
            <div className="bg-white/10 rounded-lg px-4 py-2 flex items-center gap-2">
              <Info size={16} className="text-indigo-200" />
              <span className="text-white text-sm">
                Requests: {getRemainingRequests()}/{RATE_LIMIT.maxRequests}
              </span>
            </div>
            <div className="bg-white/10 rounded-lg px-4 py-2 flex items-center gap-2">
              <Popcorn size={16} className="text-indigo-200" />
              <span className="text-white text-sm">10 Languages</span>
            </div>
            <div className="bg-white/10 rounded-lg px-4 py-2 flex items-center gap-2">
              <Clapperboard size={16} className="text-indigo-200" />
              <span className="text-white text-sm">Multiple Genres</span>
            </div>
          </div>
        </div>

        {/* Chat container */}
        <div className="flex-1 flex flex-col" style={{ height: 'calc(85vh - 160px)' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-custom">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.isBot ? 'justify-start' : 'justify-end'} message-animation`}
              >
                {message.isBot && (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
                    <MessageSquare className="text-indigo-600" size={16} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl p-4 ${
                    message.isBot
                      ? 'bg-white shadow-md text-gray-800'
                      : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white'
                  }`}
                >
                  <span className="whitespace-pre-line leading-relaxed">
                    {message.text}
                  </span>
                </div>
                {!message.isBot && (
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center ml-3">
                    <span className="text-white text-sm">You</span>
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start message-animation">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
                  <MessageSquare className="text-indigo-600" size={16} />
                </div>
                <div className="bg-white shadow-md rounded-2xl p-4">
                  <div className="typing-indicator flex gap-1">
                    <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
                    <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
                    <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Help hint */}
          <div className="px-6 py-2">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <HelpCircle size={14} />
              <span>Type "help" to see all available commands</span>
            </div>
          </div>

          {/* Input area */}
          <div className="border-t border-gray-100 p-6">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about movies, languages, or genres..."
                className="flex-1 rounded-xl border border-gray-200 p-4 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
              />
              <button
                onClick={handleSend}
                className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl px-6 hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;