import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_NAME } from '@otakuleague/shared-types';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './app.module';

describe('API (full AppModule over HTTP)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET / responds 200 with the app info from shared-types as JSON', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /application\/json/);

    expect(response.body).toEqual({ name: APP_NAME });
    expect(response.body).toEqual({ name: 'OtakuLeague' });
  });

  it('responds 404 for an unknown route', async () => {
    await request(app.getHttpServer()).get('/no-such-route').expect(404);
  });
});
