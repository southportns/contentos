import { defineConfig } from 'jsrepo';

export default defineConfig({
    // configure where stuff comes from here
    registries: ['https://reactbits.dev/r'],
    // configure where stuff goes here
    paths: {
        components: 'src/components',
        backgrounds: 'src/components/backgrounds',
        hooks: 'src/hooks',
        utils: 'src/lib/utils',
        styles: 'src/styles',
    },
});