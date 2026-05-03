
const html = `<div class="li_sense"><div class="li_sense_before">3</div><li class="sense" id="book_sng_16" hclass="sense" htag="li" sensenum="3"><span class="sensetop" hclass="sensetop" htag="span"><span class="grammar" htag="span" hclass="grammar">[transitive]</span></span> <span class="cf" htag="span" hclass="cf">book somebody/something (for something)</span> <span class="def" hclass="def" htag="span">to arrange for a singer, etc. to perform on a particular date</span></li></div>`;

const senseRegex = /<li[^>]*class="[^"]*sense[^"]*"[^>]*sensenum="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;

let match;
let count = 0;
while ((match = senseRegex.exec(html)) !== null) {
  count++;
  console.log(`Match ${count}: sensenum=${match[1]}`);
  console.log(`Content length: ${match[2].length}`);
}

if (count === 0) {
  console.log('No matches found!');
}
