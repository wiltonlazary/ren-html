// ren-html as a TypeScript consumer sees it.
import { Label, View } from 'ren-core';
import { $html, Document, serialize } from 'ren-html';

const App = () => (
  <View>
    <Label text="hi" />
  </View>
);
const page: Promise<string> = $html(() => <App />, { id: 'home', props: { user: 1 }, theme: { accent: 0xff112233 }, styles: false, timeout: 5000 });
const document = new Document();
const markup: string = serialize(document.createElement('p'));
void page, markup;
// @ts-expect-error the timeout is a number
$html(App, { timeout: 'soon' });
